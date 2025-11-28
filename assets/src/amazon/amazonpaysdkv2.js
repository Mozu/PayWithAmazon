/**
 * Amazon Pay API v2 SDK Wrapper
 * Replaces the old MWS-based amazonpaysdk.js
 */

/* jshint node: true */
/* jshint -W097 */

require('../polyfills');
var Client = require('@amazonpay/amazon-pay-api-sdk-nodejs');
var fs = require('fs');
var _ = require('underscore');

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
  self.generateButtonSignature = function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    console.debug("Generating button signature with payload:", payload);
    return self.client.generateButtonSignature(payload);
  };

  /**
   * Get checkout session details
   * @param {string} checkoutSessionId - Checkout session ID
   * @returns {Promise} Checkout session details
   */
  self.getCheckoutSession = function(checkoutSessionId) {
    console.debug("Fetching checkout session details for ID:", checkoutSessionId);
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.getCheckoutSession(checkoutSessionId).then(function(response) {
        return response.data;
    });
  };

  /**
   * Update checkout session
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {Object} payload - Update payload
   * @returns {Promise} Updated checkout session
   */
  self.updateCheckoutSession = function(checkoutSessionId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.updateCheckoutSession(checkoutSessionId, payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Complete checkout session (finalizes it)
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {Object} payload - Completion payload with chargeAmount
   * @returns {Promise} Completed checkout session
   */
  self.completeCheckoutSession = function(checkoutSessionId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.completeCheckoutSession(checkoutSessionId, payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Create charge (authorize or auth+capture)
   * @param {Object} payload - Charge payload
   * @returns {Promise} Charge result
   */
  self.createCharge = function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.createCharge(payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Get charge details
   * @param {string} chargeId - Charge ID
   * @returns {Promise} Charge details
   */
  self.getCharge = function(chargeId) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.getCharge(chargeId).then(function(response) {
        return response.data;
    });
  };

  /**
   * Capture charge (for auth-only charges)
   * @param {string} chargeId - Charge ID
   * @param {Object} payload - Capture payload with captureAmount
   * @returns {Promise} Capture result
   */
  self.captureCharge = function(chargeId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.captureCharge(chargeId, payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Cancel charge (void)
   * @param {string} chargeId - Charge ID
   * @param {Object} payload - Cancellation reason
   * @returns {Promise} Cancellation result
   */
  self.cancelCharge = function(chargeId, payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.cancelCharge(chargeId, payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Create refund
   * @param {Object} payload - Refund payload
   * @returns {Promise} Refund result
   */
  self.createRefund = function(payload) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.createRefund(payload).then(function(response) {
        return response.data;
    });
  };

  /**
   * Get refund details
   * @param {string} refundId - Refund ID
   * @returns {Promise} Refund details
   */
  self.getRefund = function(refundId) {
    if (!self.client) {
      throw new Error('Amazon Pay client not configured');
    }
    return self.client.getRefund(refundId).then(function(response) {
        return response.data;
    });
  };

  return self;
};
