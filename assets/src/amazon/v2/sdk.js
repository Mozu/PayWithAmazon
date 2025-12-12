
const Client = require('@amazonpay/amazon-pay-api-sdk-nodejs');
const { makeSignedRequest, generateIdempotencyKey, formatPrivateKey } = require('./helper');
const constants = require('./constants');

class AmazonPayV2 {
  constructor() {
    this.client = null;
    this.config = null;
  }

  configure(config) {
    const { publicKeyId, privateKey, region, isSandbox } = config || {};
    if (!publicKeyId || !privateKey) {
      throw new Error('Amazon Pay v2: publicKeyId and privateKey are required');
    }

    const { ALGORITHM: algorithm, DEFAULT_REGION: defaultRegion } = constants;
    const formattedPrivateKey = formatPrivateKey(privateKey);

    const clientConfig = {
      publicKeyId: publicKeyId,
      privateKey: formattedPrivateKey, // PEM string
      region: region || defaultRegion,
      sandbox: isSandbox || false,
      algorithm: algorithm
    };

    try {
      this.client = new Client.WebStoreClient(clientConfig);
      console.error('[AmazonPayV2.configure] Client initialized successfully for region:', config.region, 'sandbox:', config.isSandbox);
    } catch (e) {
      throw new Error('Failed to initialize Amazon Pay WebStoreClient: ' + e.message);
    }

    // Store config with corrected private key
    this.config = {
      publicKeyId: publicKeyId,
      privateKey: formattedPrivateKey, // Use the corrected private key
      region: region,
      isSandbox: isSandbox
    };
  }

  generateButtonSignature(payload) {
    constants.assertRequired(this.client, 'Amazon Pay client not configured');
    const signature = this.client.generateButtonSignature(payload);
    return signature;
  }

  async getCheckoutSession(checkoutSessionId) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(checkoutSessionId, 'Checkout session ID is required');

    console.log('[AmazonPayV2.getCheckoutSessionWithHelper] Called for session:', checkoutSessionId);
    const result = await makeSignedRequest({
      method: constants.METHODS.GET,
      path: constants.PATHS.CHECKOUT_SESSIONS + '/' + checkoutSessionId
    }, this.config);
    console.log('[AmazonPayV2.getCheckoutSessionWithHelper] Completed successfully');
    return result;
  }

  async updateCheckoutSession(checkoutSessionId, payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(checkoutSessionId, 'Checkout session ID is required');
    constants.assertRequired(payload, 'Update payload is required');
    console.log('[AmazonPayV2.updateCheckoutSession] Called for session:', checkoutSessionId);

    const requestOptions = {
      method: constants.METHODS.PATCH,
      path: constants.PATHS.CHECKOUT_SESSIONS + '/' + checkoutSessionId,
      payload: payload
    };

    const response = await makeSignedRequest(requestOptions, this.config);

    console.log('[AmazonPayV2.updateCheckoutSession] Completed successfully');
    return response;
  }

  async completeCheckoutSession(checkoutSessionId, payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(checkoutSessionId, 'Checkout session ID is required');
    constants.assertRequired(payload, 'Completion payload is required');
    console.log('[AmazonPayV2.completeCheckoutSession] Called for session:', checkoutSessionId);

    const requestOptions = {
      method: constants.METHODS.POST,
      path: constants.PATHS.CHECKOUT_SESSIONS + '/' + checkoutSessionId + constants.PATHS.COMPLETE,
      payload: payload
    };

    const response = await makeSignedRequest(requestOptions, this.config);

    console.log('[AmazonPayV2.completeCheckoutSession] Completed successfully');
    return response;
  }

  async createCharge(payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(payload, 'Charge payload is required');

    // Generate idempotency key (required for charge operations)
    const idempotencyKey = generateIdempotencyKey(constants.IDEMPOTENCY_PREFIXES.CHARGE);

    console.error('[AmazonPayV2.createCharge] Called with payload');

    const headers = { 'x-amz-pay-idempotency-key': idempotencyKey };
    const requestOptions = {
      method: constants.METHODS.POST,
      path: constants.PATHS.CHARGES,
      payload: payload,
      headers: headers
    };

    const response = await makeSignedRequest(requestOptions, this.config);

    console.log('[AmazonPayV2.createCharge] Completed successfully');
    return response;
  }

  async getCharge(chargeId) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(chargeId, 'Charge ID is required');

    console.log('[AmazonPayV2.getCharge] Called for charge:', chargeId);

    // Use helper with needle for Kibo compatibility
    const requestOptions = {
      method: constants.METHODS.GET,
      path: constants.PATHS.CHARGES + '/' + chargeId
    };

    const response = await makeSignedRequest(requestOptions, this.config);

    console.log('[AmazonPayV2.getCharge] Completed successfully');
    return response;
  }

  async captureCharge(chargeId, payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(chargeId, 'Charge ID is required');
    constants.assertRequired(payload, 'Payload is required');

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(constants.IDEMPOTENCY_PREFIXES.CAPTURE);

    console.log('[AmazonPayV2.captureCharge] Called for charge:', chargeId);

    // Use helper with needle for Kibo compatibility
    const headers = { 'x-amz-pay-idempotency-key': idempotencyKey };
    const requestOptions = {
      method: constants.METHODS.POST,
      path: constants.PATHS.CHARGES + '/' + chargeId + constants.PATHS.CAPTURE,
      payload: payload,
      headers: headers
    };

    const response = await makeSignedRequest(requestOptions, this.config);

    console.log('[AmazonPayV2.captureCharge] Completed successfully');
    return response;
  }

  async cancelCharge(chargeId, payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(chargeId, 'Charge ID is required');
    constants.assertRequired(payload, 'Payload is required');
    const requestOptions = {
      method: constants.METHODS.DELETE,
      path: constants.PATHS.CHARGES + '/' + chargeId + constants.PATHS.CANCEL,
      payload: payload
    };
    const response = await makeSignedRequest(requestOptions, this.config);
    return response;
  }

  async createRefund(payload) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    constants.assertRequired(payload, 'Refund payload is required');

    // Generate idempotency key (required for refund operations)
    const idempotencyKey = generateIdempotencyKey(constants.IDEMPOTENCY_PREFIXES.REFUND);

    const headers = { 'x-amz-pay-idempotency-key': idempotencyKey };
    const requestOptions = {
      method: constants.METHODS.POST,
      path: constants.PATHS.REFUNDS,
      payload: payload,
      headers: headers
    };
    const response = await makeSignedRequest(requestOptions, this.config);
    return response;
  }

  async getRefund(refundId) {
    constants.assertRequired(this.config, 'Amazon Pay not configured');
    const requestOptions = {
      method: constants.METHODS.GET,
      path: constants.PATHS.REFUNDS + '/' + refundId
    };
    const response = await makeSignedRequest(requestOptions, this.config);
    return response;
  }
}

module.exports = function () {
  return new AmazonPayV2();
};
