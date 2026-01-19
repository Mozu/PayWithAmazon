/**
 * Update Checkout Session Endpoint
 * Endpoint: POST /amazonpay/v2/updatecheckoutsession
 *
 * Updates an existing checkout session and returns the amazonPayRedirectUrl
 */

var amazonPayV2;
try {
  amazonPayV2 = require('../../amazon/v2/sdk')();
} catch (e) {
  console.error("CRITICAL ERROR: Failed to initialize amazonpaysdkv2", e);
}

var paymentHelper = require('../../amazon/paymenthelper');

module.exports = function (context, callback) {
  console.debug('Amazon Pay Update Checkout Session endpoint called');

  // Only handle POST requests to this specific path
  if (context.request.method !== 'POST') {
    console.error('Method not POST, skipping');
    return callback();
  }

  // Check if this is the update checkout session endpoint
  var url = context.request.url || '';
  if (url.indexOf('/amazonpay/v2/updatecheckoutsession') === -1) {
    console.error('URL does not match /amazonpay/v2/updatecheckoutsession, skipping');
    return callback();
  }

  try {
    // Parse request body
    var body = context.request.body;
    console.log('Update checkout session request body: ' + JSON.stringify(body));

    if (!body) {
      return sendError(context, 400, 'Request body is empty');
    }

    var checkoutSessionId = body.checkoutSessionId;

    // Remove checkoutSessionId from payload
    var payload = Object.assign({}, body);
    delete payload.checkoutSessionId;

    if (!checkoutSessionId) {
      return sendError(context, 400, 'checkoutSessionId is required');
    }

    if (!payload || Object.keys(payload).length === 0) {
      return sendError(context, 400, 'payload is required');
    }

    console.log('Updating checkout session:', checkoutSessionId);
    console.log('Payload:', JSON.stringify(payload));

    // Get payment configuration
    paymentHelper.getPaymentConfig(context)
      .then(function (config) {
        console.log('Payment config loaded');

        // Configure Amazon Pay v2 SDK
        amazonPayV2.configure({
          publicKeyId: config.publicKeyId,
          privateKey: config.privateKey,
          region: config.region,
          isSandbox: config.isSandbox
        });

        // Update checkout session with frontend-provided payload
        return amazonPayV2.updateCheckoutSession(checkoutSessionId, payload);
      })
      .then(function (updatedSession) {
        console.log('Checkout session updated successfully');

        // Extract the redirect URL
        var redirectUrl = updatedSession.webCheckoutDetails && updatedSession.webCheckoutDetails.amazonPayRedirectUrl;

        if (!redirectUrl) {
          console.error('No amazonPayRedirectUrl in response:', updatedSession);
          return sendError(context, 500, 'Amazon Pay redirect URL not returned');
        }

        // Return success response with redirect URL
        var response = {
          success: true,
          checkoutSessionId: checkoutSessionId,
          redirectUrl: redirectUrl,
          state: updatedSession.statusDetails ? updatedSession.statusDetails.state : 'Open'
        };

        console.error('Update checkout session response:', JSON.stringify(response));

        context.response.body = response;
        context.response.statusCode = 200;
        context.response.headers['Content-Type'] = 'application/json';

        callback();
      })
      .catch(function (err) {
        console.error('Error updating checkout session:', err);
        return sendError(context, 500, 'Failed to update checkout session: ' + (err.message || err));
      });

  } catch (e) {
    console.error('Exception in update checkout session endpoint:', e);
    return sendError(context, 500, 'Internal server error: ' + e.message);
  }
};

function sendError(context, statusCode, message) {
  console.error('Sending error response:', JSON.stringify(context.request.body), message);
  context.response.statusCode = statusCode;
  context.response.set('Content-Type', 'application/json');
  context.response.end(JSON.stringify({
    success: false,
    error: message
  }));
}
