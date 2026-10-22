/**
 * Unit tests for the manual branch of `paymenthelper.creditPaymentV2`.
 *
 * The refund IPN service (kibo-paywithamazon-ipn, COM-10342) settles a
 * CreditPending refund by sending CommerceRuntime a CreditPayment with a manual
 * interaction. CRT routes it here; this branch records the outcome without
 * calling Amazon. `isDeclined` must produce a Failed credit, otherwise a declined
 * refund is booked as money returned to the shopper.
 */

'use strict';

var assert = require('assert');

function loadPaymentHelper() {
  var sdkPath = require.resolve('../src/amazon/v2/sdk');
  var helperPath = require.resolve('../src/amazon/paymenthelper');
  var sdkCalls = [];

  require.cache[sdkPath] = {
    id: sdkPath,
    filename: sdkPath,
    loaded: true,
    exports: function () {
      return {
        configure: function () { sdkCalls.push('configure'); },
        createRefund: function () {
          sdkCalls.push('createRefund');
          return Promise.resolve({});
        }
      };
    }
  };
  delete require.cache[helperPath];

  return { helper: require('../src/amazon/paymenthelper'), sdkCalls: sdkCalls };
}

function manualCredit(manualGatewayInteraction) {
  return { amount: 10, manualGatewayInteraction: manualGatewayInteraction };
}

describe('creditPaymentV2 manual credit', function () {
  it('records an approved refund as Credited with the Amazon refund id', function () {
    var loaded = loadPaymentHelper();

    return loaded.helper
      .creditPaymentV2({}, {}, manualCredit({ gatewayTransactionId: 'S01-R001', isOrderRefund: true }), {})
      .then(function (result) {
        assert.strictEqual(result.status, 'Credited');
        assert.strictEqual(result.responseCode, 'OK');
        assert.strictEqual(result.awsTransactionId, 'S01-R001');
        assert.strictEqual(result.amount, 10);
        assert.deepStrictEqual(loaded.sdkCalls, []);
      });
  });

  it('records a declined refund as Failed with the decline reason', function () {
    var loaded = loadPaymentHelper();

    return loaded.helper
      .creditPaymentV2({}, {}, manualCredit({
        gatewayTransactionId: 'S01-R001',
        isOrderRefund: true,
        isDeclined: true,
        gatewayResponseCode: 'AmazonRejected',
        gatewayResponseText: 'Refund declined by Amazon'
      }), {})
      .then(function (result) {
        assert.strictEqual(result.status, 'Failed');
        assert.strictEqual(result.responseCode, 'AmazonRejected');
        assert.strictEqual(result.responseText, 'Refund declined by Amazon');
        assert.strictEqual(result.awsTransactionId, 'S01-R001');
        assert.deepStrictEqual(loaded.sdkCalls, []);
      });
  });

  it('defaults the response code to DECLINED when no reason is sent', function () {
    var loaded = loadPaymentHelper();

    return loaded.helper
      .creditPaymentV2({}, {}, manualCredit({ gatewayTransactionId: 'S01-R001', isDeclined: true }), {})
      .then(function (result) {
        assert.strictEqual(result.status, 'Failed');
        assert.strictEqual(result.responseCode, 'DECLINED');
      });
  });

  it('falls back to gatewayInteractionId for older manual callers', function () {
    var loaded = loadPaymentHelper();

    return loaded.helper
      .creditPaymentV2({}, {}, manualCredit({ gatewayInteractionId: 12345 }), {})
      .then(function (result) {
        assert.strictEqual(result.status, 'Credited');
        assert.strictEqual(result.awsTransactionId, 12345);
      });
  });
});
