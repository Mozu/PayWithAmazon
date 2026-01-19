/**
 * Checkout Session Signature Generator
 * Endpoint: POST /amazonpay/v2/checkoutsession
 *
 * Generates a signed checkout session payload for Amazon Pay v2 button
 */

var amazonPayV2;
try {
  amazonPayV2 = require('../../amazon/amazonpaysdkv2')();
} catch (e) {
  console.error("CRITICAL ERROR: Failed to initialize amazonpaysdkv2", e);
}

var paymentHelper = require('../../amazon/paymenthelper');

module.exports = function(context, callback) {
  console.debug('Amazon Pay Checkout Session endpoint called');

  // Only handle POST requests to this specific path
  if (context.request.method !== 'POST') {
    console.error('Method not POST, skipping');
    return callback();
  }

  // Check if this is the checkout session endpoint
  var url = context.request.url || '';
  if (url.indexOf('/amazonpay/v2/checkoutsession') === -1 && url.indexOf('/checkoutsession') === -1) {
    console.error('URL does not match /amazonpay/v2/checkoutsession or /checkoutsession, skipping');
    return callback();
  }

  try {
    // Parse request body
    var body = context.request.body;
    console.log('context.request.body: ' + JSON.stringify(body));

    if (!body) {
       return sendError(context, 400, 'Request body is empty');
    }

    var cartOrOrderId = body.cartOrOrderId;
    var isCart = body.isCart;
    var returnUrl = body.returnUrl;

    if (!returnUrl) {
      return sendError(context, 400, 'returnUrl is required');
    }

    console.log('Generating checkout session for:', {
      cartOrOrderId: cartOrOrderId,
      isCart: isCart,
      returnUrl: returnUrl
    });

    // Get payment configuration
    paymentHelper.getPaymentConfig(context).then(function(config) {
      // Configure Amazon Pay v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      // Build checkout session payload
      // TODO: For end-of-checkout placement, enhance this payload with:
      // 1. webCheckoutDetails.checkoutMode = 'ProcessOrder' (for end-of-checkout)
      // 2. paymentDetails with chargeAmount and payment intent
      // 3. addressDetails if merchant already collected shipping address
      // See: https://developer.amazon.com/docs/amazon-pay-checkout/end-of-checkout.html
      var payload = {
        webCheckoutDetails: {
          checkoutReviewReturnUrl: returnUrl
          // TODO: Add checkoutMode: 'ProcessOrder' for end-of-checkout
        },
        storeId: config.storeId
        // TODO: Add paymentDetails: { chargeAmount: {...}, paymentIntent: 'Authorize' }
        // TODO: Add addressDetails: {...} if available from request
      };

      // Add optional scopes for buyer information
      if (config.scopes) {
        payload.scopes = config.scopes;
      } else {
        // Default scopes
        payload.scopes = ['name', 'email', 'phoneNumber', 'billingAddress'];
      }

      console.debug('generateButtonSignature payload:', payload);
      // Generate signature
      var signature = amazonPayV2.generateButtonSignature(payload);

      // Return signed payload to frontend
      var response = {
        payloadJSON: JSON.stringify(payload),
        signature: signature,
        publicKeyId: config.publicKeyId
      };

      console.log('Checkout session signature generated successfully: ', response);

      // Send response
      context.response.body = response;
      context.response.end();

    }).catch(function(error) {
      console.error('Error generating checkout session:', error);
      sendError(context, 500, 'Failed to generate checkout session: ' + error.message);
    });

  } catch (error) {
    console.error('Error in checkout session endpoint:', error);
    sendError(context, 500, error.message);
  }
};

function sendError(context, statusCode, message) {
  context.response.statusCode = statusCode;
  context.response.setHeader('Content-Type', 'application/json');
  context.response.write(JSON.stringify({
    error: message
  }));
  context.response.end();
}
