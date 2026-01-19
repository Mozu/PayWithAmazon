/**
 * Get Checkout Session Data
 * Endpoint: GET /amazonpay/v2/checkout-sessions/{checkoutSessionId}
 *
 * Retrieves checkout session data (buyer info, addresses, payment methods) from Amazon Pay v2
 */

var amazonPayV2;
try {
  amazonPayV2 = require('../../amazon/v2/sdk')();
} catch (e) {
  console.error("CRITICAL ERROR: Failed to initialize amazonpaysdkv2", e);
}

var paymentHelper = require('../../amazon/paymenthelper');

module.exports = function (context, callback) {

  // Only handle GET requests to this specific path
  if (context.request.method !== 'GET') {
    return callback();
  }

  var url = context.request.url || '';

  // Check if this is the get checkout session data endpoint
  if (url.indexOf('/amazonpay/v2/checkoutsession/') === -1) {
    return callback();
  }

  try {
    // Extract checkout session ID directly from the URL using split
    var urlParts = url.split('/');
    var checkoutSessionIndex = urlParts.indexOf('checkoutsession');

    // If 'checkoutsession' is found, the next part is the session ID
    var checkoutSessionId = checkoutSessionIndex !== -1 && urlParts[checkoutSessionIndex + 1];

    if (!checkoutSessionId) {
      return sendError(context, 400, 'Checkout session ID is required in URL path');
    }

    // Get payment configuration
    paymentHelper.getPaymentConfig(context).then(function (config) {

      // Configure Amazon Pay v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      console.log('[AmazonPay] Fetching checkout session:', checkoutSessionId);

      // Get checkout session from Amazon Pay API (using helper for Kibo serverless compatibility)
      return amazonPayV2.getCheckoutSession(checkoutSessionId);

    }).then(function (sessionData) {

      // Return checkout session data to frontend
      var response = {
        success: true,
        data: sessionData
      };

      context.response.body = response;
      context.response.statusCode = 200;
      context.response.headers['Content-Type'] = 'application/json';

      callback();

    }).catch(function (error) {
      return sendError(context, 500, 'Failed to retrieve checkout session: ' + error.message);
    });

  } catch (error) {
    return sendError(context, 500, 'Internal server error: ' + error.message);
  }
};

/**
 * Send error response
 */
function sendError(context, statusCode, message) {
  context.response.body = {
    success: false,
    error: {
      code: statusCode,
      message: message
    }
  };
  context.response.statusCode = statusCode;
  context.response.headers['Content-Type'] = 'application/json';

  context.exec.callback();
}