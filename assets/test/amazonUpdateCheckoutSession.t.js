/**
 * Unit tests for the update-checkout-session endpoint's order-correlation blob.
 *
 * The endpoint is the *other* place `merchantMetadata.customInformation` gets
 * written (the authoritative one is the server-side stamp on AuthorizePayment —
 * see amazonOrderCorrelation.t.js). This route writes it from a
 * browser-supplied body, so it must never write a partial blob: the refund IPN's
 * schema requires tenantId, siteId AND orderId, and a blob missing any of them is
 * rejected — leaving the refund unresolvable while the field looks populated.
 */

'use strict';

var assert = require('assert');

/** Loads a fresh route with the v2 SDK and paymentHelper stubbed. */
function loadRoute() {
  var sdkPath = require.resolve('../src/amazon/v2/sdk');
  var helperPath = require.resolve('../src/amazon/paymenthelper');
  var routePath = require.resolve('../src/domains/storefront/amazonUpdateCheckoutSession');
  var updates = [];

  var fakeSdk = {
    configure: function () {},
    updateCheckoutSession: function (sessionId, payload) {
      updates.push({ sessionId: sessionId, payload: payload });
      return Promise.resolve({
        webCheckoutDetails: { amazonPayRedirectUrl: 'https://amazon.test/redirect' },
        statusDetails: { state: 'Open' }
      });
    }
  };

  require.cache[sdkPath] = {
    id: sdkPath,
    filename: sdkPath,
    loaded: true,
    exports: function () {
      return fakeSdk;
    }
  };
  require.cache[helperPath] = {
    id: helperPath,
    filename: helperPath,
    loaded: true,
    exports: {
      getPaymentConfig: function () {
        return Promise.resolve({ publicKeyId: 'key', privateKey: 'pem', region: 'us', isSandbox: true });
      }
    }
  };
  delete require.cache[routePath];

  return { route: require('../src/domains/storefront/amazonUpdateCheckoutSession'), updates: updates };
}

function contextFor(body, apiContext) {
  return {
    request: { method: 'POST', url: '/amazonpay/v2/updatecheckoutsession', body: body },
    apiContext: apiContext,
    response: {
      headers: {},
      statusCode: 0,
      body: null,
      set: function () {},
      json: function () {}
    }
  };
}

/**
 * A realistic storefront body. The route strips checkoutSessionId/orderId/
 * paymentId from the payload it forwards, so a body carrying only those would
 * forward an empty payload and be rejected with a 400 before the correlation
 * logic is ever reached.
 */
function storefrontBody(extra) {
  return Object.assign({ checkoutSessionId: 'cs-1', webCheckoutDetails: { checkoutMode: 'ProcessOrder' } }, extra || {});
}

/** The route is callback-style; wrap it so the tests can await it. */
function invoke(route, context) {
  return new Promise(function (resolve, reject) {
    try {
      route(context, function (err) {
        return err ? reject(err) : resolve(context);
      });
    } catch (e) {
      reject(e);
    }
  });
}

describe('amazonUpdateCheckoutSession — order correlation', function () {
  it('writes numeric tenant/site/orderId when the body supplies an orderId', function () {
    var loaded = loadRoute();
    var context = contextFor(storefrontBody({ orderId: 'order-1', paymentId: 'payment-1' }), {
      tenantId: '100046',
      siteId: '100072'
    });

    return invoke(loaded.route, context).then(function () {
      assert.equal(loaded.updates.length, 1);
      var correlation = JSON.parse(loaded.updates[0].payload.merchantMetadata.customInformation);
      assert.strictEqual(correlation.tenantId, 100046);
      assert.strictEqual(correlation.siteId, 100072);
      assert.strictEqual(correlation.orderId, 'order-1');
      assert.strictEqual(correlation.paymentId, 'payment-1');
    });
  });

  it('writes no customInformation at all when the body has no orderId', function () {
    var loaded = loadRoute();
    var context = contextFor(storefrontBody(), { tenantId: '100046', siteId: '100072' });

    return invoke(loaded.route, context).then(function () {
      assert.equal(loaded.updates.length, 1, 'the session update itself still happens');
      var metadata = loaded.updates[0].payload.merchantMetadata;
      assert.ok(
        !metadata || metadata.customInformation === undefined,
        'a blob without orderId is rejected by the IPN — writing one only hides the problem'
      );
    });
  });

  it('writes no customInformation when apiContext has no siteId', function () {
    var loaded = loadRoute();
    var context = contextFor(storefrontBody({ orderId: 'order-1' }), { tenantId: '100046' });

    return invoke(loaded.route, context).then(function () {
      var metadata = loaded.updates[0].payload.merchantMetadata;
      assert.ok(
        !metadata || metadata.customInformation === undefined,
        'the IPN schema requires siteId, so a blob without it is unusable'
      );
    });
  });

  it('drops a browser-supplied customInformation when the body has no orderId, keeping other theme keys', function () {
    var loaded = loadRoute();
    var body = storefrontBody({
      merchantMetadata: { merchantReferenceId: 'ref-1', customInformation: '{"tenantId":1,"orderId":"tampered"}' }
    });
    var context = contextFor(body, { tenantId: '100046', siteId: '100072' });

    return invoke(loaded.route, context).then(function () {
      var metadata = loaded.updates[0].payload.merchantMetadata;
      assert.equal(metadata.customInformation, undefined);
      assert.equal(metadata.merchantReferenceId, 'ref-1');
      assert.ok(body.merchantMetadata.customInformation, 'the request body itself is not mutated');
    });
  });

  it('overwrites a browser-supplied customInformation with the trusted value', function () {
    var loaded = loadRoute();
    var body = storefrontBody({
      orderId: 'order-1',
      merchantMetadata: { merchantStoreName: 'Store', customInformation: '{"orderId":"tampered"}' }
    });
    var context = contextFor(body, { tenantId: '100046', siteId: '100072' });

    return invoke(loaded.route, context).then(function () {
      var metadata = loaded.updates[0].payload.merchantMetadata;
      assert.strictEqual(JSON.parse(metadata.customInformation).orderId, 'order-1');
      assert.equal(metadata.merchantStoreName, 'Store');
    });
  });

  it('keeps internal fields out of the payload sent to Amazon', function () {
    var loaded = loadRoute();
    var context = contextFor(storefrontBody({ orderId: 'order-1', paymentId: 'payment-1' }), {
      tenantId: 100046,
      siteId: 100072
    });

    return invoke(loaded.route, context).then(function () {
      var payload = loaded.updates[0].payload;
      assert.equal(payload.checkoutSessionId, undefined);
      assert.equal(payload.orderId, undefined);
      assert.equal(payload.paymentId, undefined);
    });
  });
});
