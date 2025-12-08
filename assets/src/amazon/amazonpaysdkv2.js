/**
 * Amazon Pay API v2 SDK Wrapper
 * Replaces the old MWS-based amazonpaysdk.js
 */

/* jshint node: true */
/* jshint -W097 */

var Client = require('@amazonpay/amazon-pay-api-sdk-nodejs');

module.exports = function() {
  'use strict';
  var self = {};
  self.client = null;
  self.config = null;

  /**
   * Configure the Amazon Pay v2 client
   * @param {Object} config - Configuration object
   * @param {string} config.publicKeyId - Public key ID from Amazon Pay
   * @param {string} config.privateKey - Private key content (PEM format)
   * @param {string} config.region - Region (us, eu, jp)
   * @param {boolean} config.isSandbox - Sandbox mode flag
   */
  self.configure = function(config) {
    console.debug('Configuring Amazon Pay v2 client with config:', config);
    if (!config.publicKeyId || !config.privateKey) {
      throw new Error('Amazon Pay v2: publicKeyId and privateKey are required');
    }

    var privateKey = config.privateKey;
    
    // Transform single-line private keys into proper PEM format. 
    //    When saved through UI, the key is stored as single line without newline characters
    if (privateKey && privateKey.indexOf('\n') === -1 && privateKey.indexOf('-----BEGIN PRIVATE KEY-----') !== -1) {
        var header = '-----BEGIN PRIVATE KEY-----';
        var footer = '-----END PRIVATE KEY-----';
        var body = privateKey.replace(header, '').replace(footer, '').trim();
        // Remove any spaces in the body to ensure clean base64
        body = body.replace(/ /g, '');
        //Apply proper PEM formatting with newlines between header, body, and footer
        privateKey = header + '\n' + body + '\n' + footer;
    }

    var clientConfig = {
      publicKeyId: config.publicKeyId,
      privateKey: privateKey, // PEM string
      region: config.region || 'us',
      sandbox: config.isSandbox || false,
      algorithm: "AMZN-PAY-RSASSA-PSS-V2"
    };

    try {
      self.client = new Client.AmazonPayClient(clientConfig);
      console.debug('Amazon Pay v2 client initialized successfully.');
    } catch (e) {
      console.error('Failed to initialize Amazon Pay client:', e);
      throw e;
    }
    
    self.config = config;
  };

  /**
   * Generate button signature for checkout session
   * @param {Object} payload - Checkout session payload
   * @returns {string} Signature
   */
  self.generateButtonSignature = async function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    console.debug("Generating button signature with payload:", payload);
    // generateButtonSignature returns the signature string directly, not a response object
    var signature = await self.client.generateButtonSignature(payload);
    return signature;
  };

  /**
   * Get checkout session details
   * @param {string} checkoutSessionId - Checkout session ID
   * @returns {Promise} Checkout session details
   */
  self.getCheckoutSession = async function(checkoutSessionId) {
    console.debug("Fetching checkout session details for ID:", checkoutSessionId);
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.getCheckoutSession(checkoutSessionId);
    return response.data;
  };

  /**
   * Update checkout session
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {Object} payload - Update payload
   * @returns {Promise} Updated checkout session
   */
  self.updateCheckoutSession = async function(checkoutSessionId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.updateCheckoutSession(checkoutSessionId, payload);
    return response.data;
  };

  /**
   * Complete checkout session (finalizes it)
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {Object} payload - Completion payload with chargeAmount
   * @returns {Promise} Completed checkout session
   */
  self.completeCheckoutSession = async function(checkoutSessionId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.completeCheckoutSession(checkoutSessionId, payload);
    return response.data;
  };

  /**
   * Create charge (authorize or auth+capture)
   * @param {Object} payload - Charge payload
   * @returns {Promise} Charge result
   */
  self.createCharge = async function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.createCharge(payload);
    return response.data;
  };

  /**
   * Get charge details
   * @param {string} chargeId - Charge ID
   * @returns {Promise} Charge details
   */
  self.getCharge = async function(chargeId) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.getCharge(chargeId);
    return response.data;
  };

  /**
   * Capture charge (for auth-only charges)
   * @param {string} chargeId - Charge ID
   * @param {Object} payload - Capture payload with captureAmount
   * @returns {Promise} Capture result
   */
  self.captureCharge = async function(chargeId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.captureCharge(chargeId, payload);
    return response.data;
  };

  /**
   * Cancel charge (void)
   * @param {string} chargeId - Charge ID
   * @param {Object} payload - Cancellation reason
   * @returns {Promise} Cancellation result
   */
  self.cancelCharge = async function(chargeId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.cancelCharge(chargeId, payload);
    return response.data;
  };

  /**
   * Create refund
   * @param {Object} payload - Refund payload
   * @returns {Promise} Refund result
   */
  self.createRefund = async function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.createRefund(payload);
    return response.data;
  };

  /**
   * Get refund details
   * @param {string} refundId - Refund ID
   * @returns {Promise} Refund details
   */
  self.getRefund = async function(refundId) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    var response = await self.client.getRefund(refundId);
    return response.data;
  };

  return self;
};
