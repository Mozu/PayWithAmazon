/**
 * Amazon Pay API v2 Helper
 * Manual signature generation for API calls in Kibo serverless environment
 */

/* jshint node: true */
/* jshint -W097 */

const crypto = require('crypto');
const https = require('https');
const constants = require('./constants');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate idempotency key for API requests
 * @param {string} prefix - Prefix for the key (charge_, capture_, refund_)
 * @returns {string} Idempotency key
 */
function generateIdempotencyKey(prefix) {
  return prefix + Date.now() + '_' + Math.random().toString(36).substring(7);
}

/**
 * Format private key to proper PEM format
 * @param {string|Buffer} privateKey - Private key to format
 * @returns {string} Formatted private key
 */
function formatPrivateKey(privateKey) {
  // Ensure private key is a string, not a buffer
  if (Buffer.isBuffer(privateKey)) {
    privateKey = privateKey.toString('utf8');
  } else if (typeof privateKey !== 'string') {
    throw new Error('Private key must be a string or buffer');
  }

  // Fix private key format if needed (handle malformed PEM keys)
  if (privateKey && privateKey.indexOf(constants.PRIVATE_KEY_BEGIN) !== -1) {
    // Check if key needs format correction
    if (privateKey.indexOf(constants.PRIVATE_KEY_BEGIN + '\n') !== 0 ||
        privateKey.indexOf('\n' + constants.PRIVATE_KEY_END) === -1) {

      const startMarker = constants.PRIVATE_KEY_BEGIN;
      const endMarker = constants.PRIVATE_KEY_END;
      const startIndex = privateKey.indexOf(startMarker);
      const endIndex = privateKey.indexOf(endMarker);

      if (startIndex !== -1 && endIndex !== -1) {
        const fullContent = privateKey.substring(startIndex + startMarker.length, endIndex);
        const base64Content = fullContent.replace(/\s/g, '');

        if (base64Content.length > 0) {
          const formattedBase64 = base64Content.match(/.{1,64}/g).join('\n');
          privateKey = startMarker + '\n' + formattedBase64 + '\n' + endMarker;
        }
      }
    }
  }

  return privateKey;
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Check if public key ID is environment-specific
 * @param {string} publicKeyId - Public key ID
 * @returns {boolean} True if environment-specific
 */
function isEnvironmentSpecificKey(publicKeyId) {
  const upperKeyId = publicKeyId.toUpperCase();
  return upperKeyId.startsWith('LIVE') || upperKeyId.startsWith('SANDBOX');
}

/**
 * Build canonical URI with proper environment prefix
 * @param {string} path - API path
 * @param {boolean} isEnvSpecific - Whether key is environment-specific
 * @param {boolean} isSandbox - Sandbox mode flag
 * @returns {string} Canonical URI
 */
function buildCanonicalUri(path, isEnvSpecific, isSandbox) {
  if (isEnvSpecific) {
    return '/v2' + path;
  }
  const envPrefix = isSandbox ? '/sandbox' : '/live';
  return envPrefix + '/v2' + path;
}

/**
 * Get API host for region
 * @param {string} region - Region code
 * @returns {string} API host
 */
function getApiHost(region) {
  const regionLower = region.toLowerCase();
  return constants.API_HOSTS[regionLower] || constants.API_HOSTS.us;
}

/**
 * Get ISO timestamp for Amazon Pay API
 * @returns {string} ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString().split('.')[0] + 'Z';
}

/**
 * Serialize payload to string
 * @param {Object|string|null} payload - Request payload
 * @returns {string} Serialized payload
 */
function serializePayload(payload) {
  if (!payload) {
    return '';
  }
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

/**
 * Get Node.js version safely
 * @returns {string} Node version
 */
function getNodeVersion() {
  try {
    if (typeof process !== 'undefined') {
      if (process.versions && process.versions.node) {
        return process.versions.node;
      }
      if (process.version) {
        return process.version.replace('v', '');
      }
    }
  } catch (_e) {
    // Fall through to default
  }
  return constants.DEFAULT_NODE_VERSION;
}

/**
 * Get mapped region for API
 * @param {string} region - Region code
 * @returns {string} Mapped region
 */
function getMappedRegion(region) {
  const regionLower = region.toLowerCase();
  return constants.REGION_MAP[regionLower] || regionLower;
}

/**
 * Build headers for signing
 * @param {string} host - API host
 * @param {string} regionLower - Mapped region
 * @param {string} amzDate - Timestamp
 * @param {string} nodeVersion - Node version
 * @param {Object} additionalHeaders - Additional headers
 * @returns {Object} Headers to sign
 */
function buildHeadersToSign(host, regionLower, amzDate, nodeVersion, additionalHeaders) {
  const headersToSign = {
    'accept': constants.HEADERS.ACCEPT,
    'content-type': constants.HEADERS.CONTENT_TYPE,
    'user-agent': `amazon-pay-api-sdk-nodejs/${constants.SDK_VERSION} (JS/${nodeVersion}; ${process.platform})`,
    'x-amz-pay-date': amzDate,
    'x-amz-pay-host': host,
    'x-amz-pay-region': regionLower
  };

  // Merge additional headers with lowercase keys
  for (const headerName in additionalHeaders) {
    if (additionalHeaders.hasOwnProperty(headerName)) {
      headersToSign[headerName.toLowerCase()] = additionalHeaders[headerName];
    }
  }

  return headersToSign;
}

/**
 * Build canonical headers string and signed headers list
 * @param {Object} headersToSign - Headers to sign
 * @returns {Object} Object with canonicalHeaders and signedHeaders
 */
function buildCanonicalHeaders(headersToSign) {
  const sortedHeaderNames = Object.keys(headersToSign).sort();
  let canonicalHeaders = '';
  const signedHeadersList = [];

  for (let i = 0; i < sortedHeaderNames.length; i++) {
    const headerName = sortedHeaderNames[i];
    canonicalHeaders += `${headerName}:${headersToSign[headerName]}\n`;
    signedHeadersList.push(headerName);
  }

  return {
    canonicalHeaders,
    signedHeaders: signedHeadersList.join(';')
  };
}

/**
 * Calculate payload hash
 * @param {string} payloadString - Serialized payload
 * @returns {string} Hex-encoded hash
 */
function calculatePayloadHash(payloadString) {
  return crypto.createHash(constants.HASH_ALGORITHM).update(payloadString).digest('hex');
}

/**
 * Build canonical request
 * @param {string} method - HTTP method
 * @param {string} canonicalUri - Canonical URI
 * @param {string} canonicalHeaders - Canonical headers string
 * @param {string} signedHeaders - Signed headers list
 * @param {string} payloadHash - Payload hash
 * @returns {string} Canonical request
 */
function buildCanonicalRequest(method, canonicalUri, canonicalHeaders, signedHeaders, payloadHash) {
  const canonicalQuerystring = '';
  return `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
}

/**
 * Create signature for request
 * @param {string} canonicalRequest - Canonical request string
 * @param {string} privateKey - Private key
 * @returns {string} Base64-encoded signature
 */
function createSignature(canonicalRequest, privateKey) {
  const hashedCanonicalRequest = crypto.createHash(constants.HASH_ALGORITHM)
    .update(canonicalRequest)
    .digest('hex');
  
  const stringToSign = `${constants.ALGORITHM}\n${hashedCanonicalRequest}`;
  
  const sign = crypto.createSign(constants.SIGN_ALGORITHM).update(stringToSign);
  
  return sign.sign({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.SALT_LENGTH
  }, 'base64');
}

/**
 * Build authorization header
 * @param {string} publicKeyId - Public key ID
 * @param {string} signedHeaders - Signed headers list
 * @param {string} signature - Request signature
 * @returns {string} Authorization header value
 */
function buildAuthorizationHeader(publicKeyId, signedHeaders, signature) {
  return `${constants.ALGORITHM} PublicKeyId=${publicKeyId}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Build request headers for HTTP request
 * @param {string} authorization - Authorization header
 * @param {string} host - API host
 * @param {string} regionLower - Mapped region
 * @param {string} amzDate - Timestamp
 * @param {string} nodeVersion - Node version
 * @param {Object} additionalHeaders - Additional headers
 * @param {string} method - HTTP method
 * @param {string} payloadString - Serialized payload
 * @returns {Object} Request headers
 */
function buildRequestHeaders(authorization, host, regionLower, amzDate, nodeVersion, additionalHeaders, method, payloadString) {
  const headers = {
    'authorization': authorization,
    'x-amz-pay-date': amzDate,
    'x-amz-pay-host': host,
    'x-amz-pay-region': regionLower,
    'content-type': constants.HEADERS.CONTENT_TYPE,
    'accept': constants.HEADERS.ACCEPT,
    'user-agent': `amazon-pay-api-sdk-nodejs/${constants.SDK_VERSION} (JS/${nodeVersion}; ${process.platform})`
  };

  // Add additional headers
  for (const headerName in additionalHeaders) {
    if (additionalHeaders.hasOwnProperty(headerName)) {
      headers[headerName] = additionalHeaders[headerName];
    }
  }

  // Add content-length for requests with body
  if (method !== constants.METHODS.GET && payloadString) {
    headers['content-length'] = Buffer.byteLength(payloadString);
  }

  return headers;
}

/**
 * Execute HTTPS request
 * @param {string} host - API host
 * @param {string} canonicalUri - Request path
 * @param {string} method - HTTP method
 * @param {Object} headers - Request headers
 * @param {string} payloadString - Request body
 * @returns {Promise<Object>} API response
 */
function executeHttpsRequest(host, canonicalUri, method, headers, payloadString) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path: canonicalUri,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[AmazonPayV2Helper] Request completed successfully with status:', res.statusCode);
          try {
            resolve(JSON.parse(data));
          } catch (_e) {
            resolve(data);
          }
        } else {
          const errorMsg = data ? `Amazon Pay API error: ${res.statusCode} - ${data}`
            : `Amazon Pay API error: ${res.statusCode}`;
          reject(new Error(errorMsg));
        }
      });
    });

    req.on('error', reject);

    // Write payload for requests with body
    if (method !== constants.METHODS.GET && payloadString) {
      req.write(payloadString);
    }

    req.end();
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Make signed Amazon Pay API request
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (GET, POST, PATCH, DELETE)
 * @param {string} options.path - API path (e.g., '/checkoutSessions/xxx')
 * @param {Object} options.payload - Request payload (optional)
 * @param {Object} options.headers - Additional headers (optional)
 * @param {Object} config - Amazon Pay configuration
 * @param {string} config.publicKeyId - Public key ID
 * @param {string} config.privateKey - Private key (PEM format)
 * @param {string} config.region - Region code (us, eu, jp)
 * @param {boolean} config.isSandbox - Sandbox mode flag
 * @returns {Promise<Object>} API response
 */
function makeSignedRequest(options, config) {
  // Extract and normalize inputs
  const method = options.method.toUpperCase();
  const path = options.path;
  const payload = options.payload || null;
  const additionalHeaders = options.headers || {};

  // Build request components
  const isEnvSpecific = isEnvironmentSpecificKey(config.publicKeyId);
  const canonicalUri = buildCanonicalUri(path, isEnvSpecific, config.isSandbox);
  const host = getApiHost(config.region);
  const amzDate = getTimestamp();
  const payloadString = serializePayload(payload);
  const regionLower = getMappedRegion(config.region);
  const nodeVersion = getNodeVersion();

  // Build and sign request
  const headersToSign = buildHeadersToSign(host, regionLower, amzDate, nodeVersion, additionalHeaders);
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headersToSign);
  const payloadHash = calculatePayloadHash(payloadString);
  const canonicalRequest = buildCanonicalRequest(method, canonicalUri, canonicalHeaders, signedHeaders, payloadHash);
  const signature = createSignature(canonicalRequest, config.privateKey);
  const authorization = buildAuthorizationHeader(config.publicKeyId, signedHeaders, signature);

  // Build final request headers and execute
  const requestHeaders = buildRequestHeaders(
    authorization, 
    host, 
    regionLower, 
    amzDate, 
    nodeVersion, 
    additionalHeaders, 
    method, 
    payloadString
  );

  return executeHttpsRequest(host, canonicalUri, method, requestHeaders, payloadString);
}

module.exports = {
  makeSignedRequest,
  generateIdempotencyKey,
  formatPrivateKey
};
