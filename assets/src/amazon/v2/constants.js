/**
 * Amazon Pay API v2 Constants
 */

module.exports = {
    // Algorithm
    ALGORITHM: 'AMZN-PAY-RSASSA-PSS-V2',

    // SDK Version
    SDK_VERSION: '2.3.4',

    // Private Key Markers
    PRIVATE_KEY_BEGIN: '-----BEGIN PRIVATE KEY-----',
    PRIVATE_KEY_END: '-----END PRIVATE KEY-----',

    // Region Mapping (v1 to v2)
    REGION_MAP: {
        'na': 'na',
        'us': 'na',
        'eu': 'eu',
        'de': 'eu',
        'uk': 'eu',
        'jp': 'jp'
    },

    // API Hosts
    API_HOSTS: {
        'na': 'pay-api.amazon.com',
        'us': 'pay-api.amazon.com',
        'eu': 'pay-api.amazon.eu',
        'jp': 'pay-api.amazon.com'
    },

    // Default Region
    DEFAULT_REGION: 'na',

    // Signature Configuration
    SALT_LENGTH: 32,
    HASH_ALGORITHM: 'sha256',
    SIGN_ALGORITHM: 'RSA-SHA256',

    // HTTP Headers
    HEADERS: {
        ACCEPT: 'application/json',
        CONTENT_TYPE: 'application/json'
    },

    // Default Node Version (fallback)
    DEFAULT_NODE_VERSION: '18.0.0',

    // API Paths
    PATHS: {
        CHECKOUT_SESSIONS: '/checkoutSessions',
        CHARGES: '/charges',
        REFUNDS: '/refunds',
        COMPLETE: '/complete',
        CAPTURE: '/capture',
        CANCEL: '/cancel'
    },

    // HTTP Methods
    METHODS: {
        GET: 'GET',
        POST: 'POST',
        PATCH: 'PATCH',
        DELETE: 'DELETE'
    },

    // Idempotency Key Prefixes
    IDEMPOTENCY_PREFIXES: {
        CHARGE: 'charge_',
        CAPTURE: 'capture_',
        REFUND: 'refund_'
    },

    /**
     * Assert that a required value exists
     * @param {*} value - Value to check
     * @param {string} message - Error message if value is falsy
     * @throws {Error} If value is falsy
     */
    assertRequired: (value, message) => {
        if (!value) {
            throw new Error(message);
        }
    }
};
