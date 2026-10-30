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
  console.log('Amazon Pay Update Checkout Session endpoint called');

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
      return sendError(context, callback, 400, 'Request body is empty');
    }

    var checkoutSessionId = body.checkoutSessionId;

    // Whitelist only the fields Amazon's UpdateCheckoutSession API accepts
    var payload = {};
    if (body.paymentDetails) payload.paymentDetails = body.paymentDetails;
    if (body.merchantMetadata) payload.merchantMetadata = body.merchantMetadata;
    if (body.providerMetadata) payload.providerMetadata = body.providerMetadata;
    if (body.storeId) payload.storeId = body.storeId;
    if (body.webCheckoutDetails && body.webCheckoutDetails.checkoutResultReturnUrl) {
      payload.webCheckoutDetails = {
        checkoutResultReturnUrl: body.webCheckoutDetails.checkoutResultReturnUrl
      };
    }

    var orderId = body.orderId;
    var paymentId = body.paymentId;

    // Store tenantId, siteId, orderId, paymentId in merchantMetadata for IPN lookups.
    //
    // Only written when all three values the refund IPN keys on are present and
    // numeric. A partial blob is worse than none: the IPN's schema requires
    // tenantId, siteId and orderId, so {tenantId, siteId} alone is rejected and the
    // refund is dropped anyway - but it *looks* like correlation data, which makes
    // the failure harder to diagnose than an absent field. The authoritative stamp
    // is server-side (paymenthelper.stampOrderCorrelation, on AuthorizePayment),
    // which reads trusted values from apiContext and the payment.
    var apiContext = context.apiContext || {};
    var tenantId = Number(apiContext.tenantId);
    var siteId = Number(apiContext.siteId);
    // Copied so neither branch mutates the request body's merchantMetadata.
    payload.merchantMetadata = Object.assign({}, payload.merchantMetadata);
    if (tenantId && siteId && orderId) {
      // Emitted as numbers: the IPN coerces either way, but pinning the type here
      // keeps the stored value canonical.
      var customInfo = { tenantId: tenantId, siteId: siteId, orderId: orderId };
      if (paymentId) customInfo.paymentId = paymentId;
      payload.merchantMetadata.customInformation = JSON.stringify(customInfo);
    } else {
      // Never forward a browser-supplied correlation blob; the theme's other metadata keys stay.
      delete payload.merchantMetadata.customInformation;
      console.warn(
        '[ORDER CORRELATION] Not writing customInformation - missing tenantId, siteId or orderId',
        { tenantId: apiContext.tenantId, siteId: apiContext.siteId, hasOrderId: !!orderId }
      );
    }
    if (Object.keys(payload.merchantMetadata).length === 0) {
      delete payload.merchantMetadata;
    }

    if (!checkoutSessionId) {
      return sendError(context, callback, 400, 'checkoutSessionId is required');
    }

    if (!payload || Object.keys(payload).length === 0) {
      return sendError(context, callback, 400, 'payload is required');
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
          return sendError(context, callback, 500, 'Amazon Pay redirect URL not returned');
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
        context.response.set('Content-Type', 'application/json');

        callback();
      })
      .catch(function (err) {
        console.error('Error updating checkout session:', err);
        return sendError(context, callback, 500, 'Failed to update checkout session: ' + (err.message || err));
      });

  } catch (e) {
    console.error('Exception in update checkout session endpoint:', e);
    return sendError(context, callback, 500, 'Internal server error: ' + e.message);
  }
};

function sendError(context, callback, statusCode, message) {
  console.error('Sending error response:', message);
  context.response.body = {
    success: false,
    error: message
  };
  context.response.statusCode = statusCode;
  context.response.set('Content-Type', 'application/json');
  callback();
}
