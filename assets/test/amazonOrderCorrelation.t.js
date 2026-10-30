/**
 * Unit tests for the server-side order-correlation stamp
 * (`paymenthelper.stampOrderCorrelation`).
 *
 * Why these matter: the refund IPN (kibo-paywithamazon-ipn) resolves a refund
 * back to its Kibo order by reading `merchantMetadata.customInformation` off the
 * charge permission. If the stamp is missing, partial or carries the wrong
 * orderId, the refund is silently unresolvable — so each branch below is the
 * difference between a recoverable refund and a lost one. The stamp is
 * deliberately non-fatal, which makes it easy to break without noticing; these
 * tests are the only thing standing between a bad stamp and a dropped refund.
 *
 * The v2 SDK is instantiated when `paymenthelper` loads, so it must be stubbed
 * in the module cache *before* the first require.
 */

'use strict';

var assert = require('assert');

/**
 * Loads a fresh `paymenthelper` with `amazonPayV2` replaced by a stub that
 * records every `updateChargePermission` call.
 *
 * @param {function=} onUpdate optional replacement for the stub's behaviour;
 *        defaults to resolving with a plausible Amazon response.
 */
function loadPaymentHelper(onUpdate) {
  var sdkPath = require.resolve('../src/amazon/v2/sdk');
  var helperPath = require.resolve('../src/amazon/paymenthelper');
  var calls = [];

  var fakeSdk = {
    updateChargePermission: function (chargePermissionId, payload) {
      calls.push({ chargePermissionId: chargePermissionId, payload: payload });
      return onUpdate
        ? onUpdate(chargePermissionId, payload)
        : Promise.resolve({ statusDetails: { state: 'Chargeable' } });
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
  delete require.cache[helperPath];

  return { helper: require('../src/amazon/paymenthelper'), calls: calls };
}

function correlationOf(call) {
  return JSON.parse(call.payload.merchantMetadata.customInformation);
}

// NOTE: the stamp logs on every branch. That output is deliberately left alone —
// mocha 2.x's reporter writes through console.log, so replacing the console
// globals silently swallows the per-test output and a failure stops naming the
// test that failed. Noise here is cheaper than a suite you cannot read.

describe('paymenthelper.stampOrderCorrelation', function () {
  it('stamps numeric tenant/site/order and preserves the theme\'s other metadata keys', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: '100046', siteId: '100072' } };
    var payment = { id: 'payment-1', orderId: 'order-1' };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, payment, { merchantReferenceId: 'ref-1' })
      .then(function () {
        assert.equal(loaded.calls.length, 1, 'expected exactly one Amazon call');
        assert.equal(loaded.calls[0].chargePermissionId, 'cp-1');

        // A PATCH of merchantMetadata with only customInformation would drop the
        // keys a theme set.
        assert.equal(loaded.calls[0].payload.merchantMetadata.merchantReferenceId, 'ref-1');

        var correlation = correlationOf(loaded.calls[0]);
        assert.strictEqual(correlation.tenantId, 100046, 'tenantId must be stored as a number');
        assert.strictEqual(correlation.siteId, 100072, 'siteId must be stored as a number');
        assert.strictEqual(correlation.orderId, 'order-1');
        assert.strictEqual(correlation.paymentId, 'payment-1');
      });
  });

  it('omits paymentId when the payment has none, rather than storing a null', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, {})
      .then(function () {
        var correlation = correlationOf(loaded.calls[0]);
        assert.equal(correlation.paymentId, undefined);
        assert.strictEqual(correlation.orderId, 'order-1');
      });
  });

  // A partial blob is worse than none: the IPN's schema requires tenantId, siteId
  // and orderId, so it is rejected either way — but a populated-looking field
  // makes the failure harder to diagnose than an absent one.
  it('writes nothing when siteId is missing', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, {})
      .then(function () {
        assert.equal(loaded.calls.length, 0, 'must not stamp an unusable correlation');
      });
  });

  it('writes nothing when orderId is missing', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { id: 'payment-1' }, {})
      .then(function () {
        assert.equal(loaded.calls.length, 0);
      });
  });

  it('writes nothing when tenantId is missing', function () {
    var loaded = loadPaymentHelper();

    return loaded.helper
      .stampOrderCorrelation('cp-1', { apiContext: {} }, { orderId: 'order-1' }, {})
      .then(function () {
        assert.equal(loaded.calls.length, 0);
      });
  });

  it('skips the Amazon call when the charge permission already carries matching correlation', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };
    var existing = {
      customInformation: JSON.stringify({
        tenantId: 100046,
        siteId: 100072,
        orderId: 'order-1',
        paymentId: 'payment-1'
      })
    };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { id: 'payment-1', orderId: 'order-1' }, existing)
      .then(function () {
        assert.equal(loaded.calls.length, 0, 'the common storefront case must cost no Amazon call');
      });
  });

  it('overwrites a shopper-supplied (tampered) orderId with the trusted one', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };
    var existing = {
      customInformation: JSON.stringify({ tenantId: 100046, siteId: 100072, orderId: 'attacker-order' })
    };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, existing)
      .then(function () {
        assert.equal(loaded.calls.length, 1, 'a mismatch must not be treated as already-stamped');
        assert.strictEqual(correlationOf(loaded.calls[0]).orderId, 'order-1');
      });
  });

  it('overwrites existing customInformation that is not parseable JSON', function () {
    var loaded = loadPaymentHelper();
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, { customInformation: 'not-json' })
      .then(function () {
        assert.equal(loaded.calls.length, 1);
        assert.strictEqual(correlationOf(loaded.calls[0]).orderId, 'order-1');
      });
  });

  it('resolves without throwing when Amazon rejects the update (the stamp is non-fatal)', function () {
    var loaded = loadPaymentHelper(function () {
      return Promise.reject(new Error('Amazon Pay returned 400'));
    });
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, {})
      .then(function () {
        assert.equal(loaded.calls.length, 1, 'the call was attempted');
      });
  });

  it('resolves without throwing when the update throws synchronously', function () {
    var loaded = loadPaymentHelper(function () {
      throw new Error('SDK exploded');
    });
    var context = { apiContext: { tenantId: 100046, siteId: 100072 } };

    return loaded.helper
      .stampOrderCorrelation('cp-1', context, { orderId: 'order-1' }, {})
      .then(function () {
        assert.equal(loaded.calls.length, 1);
      });
  });
});
