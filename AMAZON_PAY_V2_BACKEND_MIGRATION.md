# Amazon Pay v2 Backend Migration Summary

## Overview
This document outlines the backend changes made to migrate from Amazon MWS API (OffAmazonPayments) to Amazon Pay API v2.

## ✅ Completed Backend Changes

### 1. **Amazon Pay v2 SDK Installation**
- **Package:** `@amazonpay/amazon-pay-api-sdk-nodejs`
- **Status:** ✅ Installed
- **Location:** `node_modules/@amazonpay/amazon-pay-api-sdk-nodejs`

### 2. **New v2 SDK Wrapper** (`assets/src/amazon/amazonpaysdkv2.js`)
- **Status:** ✅ Created
- **Purpose:** Wrapper for Amazon Pay API v2 SDK

**Key Methods:**
- `configure(config)` - Initialize SDK client
- `generateButtonSignature(payload)` - Generate checkout session signature
- `getCheckoutSession(checkoutSessionId)` - Retrieve session details
- `updateCheckoutSession(checkoutSessionId, payload)` - Update session
- `completeCheckoutSession(checkoutSessionId, payload)` - Finalize session
- `createCharge(payload)` - Create charge (auth or auth+capture)
- `getCharge(chargeId)` - Get charge details
- `captureCharge(chargeId, payload)` - Capture authorized charge
- `cancelCharge(chargeId, payload)` - Cancel/void charge
- `createRefund(payload)` - Create refund
- `getRefund(refundId)` - Get refund details

### 3. **Checkout Session Signature Endpoint** (`assets/src/domains/storefront/amazonCheckoutSession.js`)
- **Status:** ✅ Created
- **Endpoint:** `POST /api/commerce/amazonpay/v2/checkoutsession`
- **Purpose:** Generate signed checkout session payload for frontend button

**Request:**
```json
{
  "cartOrOrderId": "string",
  "isCart": boolean,
  "returnUrl": "string"
}
```

**Response:**
```json
{
  "payloadJSON": "string (JSON stringified payload)",
  "signature": "string (cryptographic signature)",
  "publicKeyId": "string"
}
```

**Added to Manifest:** `assets/src/storefront.manifest.js`
- Action: `http.storefront.request.before`
- Intercepts requests to `/api/commerce/amazonpay/v2/checkoutsession`

### 4. **Payment Helper Updates** (`assets/src/amazon/paymenthelper.js`)
- **Status:** ✅ Updated
- **Changes:** `getConfig()` method now returns v2 credentials

**New Configuration Fields:**
```javascript
{
  // Amazon Pay API v2
  publicKeyId: "...",     // Public key ID
  privateKey: "...",      // Private key (PEM string)
  storeId: "...",         // Store ID
  merchantId: "...",      // Merchant ID

  // Legacy MWS (for backward compatibility)
  mwsAccessKeyId: "...",
  mwsSecret: "...",
  sellerId: "...",
  clientId: "..."
}
```

### 5. **Checkout Session Handling** (`assets/src/amazon/checkout.js`)
- **Status:** ✅ Updated with v2 support

**New Functions:**
- `getCheckoutSessionDetails(ctx, checkoutSessionId)` - Retrieve checkout session
- `getFulfillmentInfoFromSession(checkoutSession, data, context)` - Parse shipping from session
- `getBillingInfoFromSession(checkoutSessionId, billingContact)` - Parse billing from session

### 6. **Payment Action Handler** (`assets/src/domains/commerce.payments/amazonPaymentActionBefore.js`)
- **Status:** ✅ Updated
- **Changes:** Now detects and handles both:
  - Amazon Pay v1: `awsReferenceId`
  - Amazon Pay v2: `checkoutSessionId`

**Flow:**
1. Check payment data for `checkoutSessionId` or `awsReferenceId`
2. If `checkoutSessionId` → Use v2 flow (`getBillingInfoFromSession`)
3. If `awsReferenceId` → Use legacy v1 flow (`getBillingInfo`)

## ✅ Payment Processing Update (`assets/src/amazon/paymenthelper.js`)
**Status:** ✅ Complete

**New v2 Methods Created:**
- `confirmAndAuthorizeV2()` - Complete checkout session + create charge
- `captureAmountV2()` - Capture authorized charge
- `voidPaymentV2()` - Cancel/void charge
- `creditPaymentV2()` - Create refund
- `isCheckoutSession()` - Detect v2 vs v1 payment

**API Mapping:**
| Old MWS API | New v2 API | Method | Status |
|-------------|------------|--------|--------|
| `SetOrderReferenceDetails` | `updateCheckoutSession` | amazonpaysdkv2.js | ✅ Created |
| `ConfirmOrderReference` | `completeCheckoutSession` | amazonpaysdkv2.js | ✅ Created |
| `Authorize` | `createCharge` | paymenthelper.confirmAndAuthorizeV2 | ✅ Created |
| `Capture` | `captureCharge` | paymenthelper.captureAmountV2 | ✅ Created |
| `CancelOrderReference` | `cancelCharge` | paymenthelper.voidPaymentV2 | ✅ Created |
| `Refund` | `createRefund` | paymenthelper.creditPaymentV2 | ✅ Created |
| `GetOrderReferenceDetails` | `getCheckoutSession` | amazonpaysdkv2.js | ✅ Created |

**Payment Flow Dispatcher (`assets/src/amazon/checkout.js` - processPayment method):**
✅ Updated to detect checkout session vs order reference
✅ Routes to v2 methods when `externalTransactionId` starts with `amzn-checkout-`
✅ Routes to v1 methods for backward compatibility with existing orders

## ⏳ Remaining Backend Work

### 1. **Configuration Settings** (`assets/src/domains/platform.applications/amazonInstall.js`)
**Status:** ⏳ Pending
**Required:** Add v2 credential fields to app installation settings

**New Settings to Add:**
```javascript
{
  apiName: "publicKeyId",
  label: "Public Key ID",
  required: true,
  description: "Amazon Pay API v2 Public Key ID from Integration Central"
},
{
  apiName: "privateKey", // Stored in secure app data
  label: "Private Key",
  required: true,
  isSecure: true,
  description: "Amazon Pay API v2 Private Key (PEM format)"
},
{
  apiName: "storeId",
  label: "Store ID",
  required: true,
  description: "Amazon Pay Store ID from Integration Central"
},
{
  apiName: "merchantId",
  label: "Merchant ID",
  required: true,
  description: "Amazon Pay Merchant ID (formerly Seller ID)"
}
```

### 2. **Token Details Handler**
**Status:** ⏳ Needs Investigation
**Question:** Where is the `thirdPartyPaymentExecute` with `methodName: "tokenDetails"` handled?

The frontend calls:
```javascript
payWithAmazonToken.apiModel.thirdPartyPaymentExecute({
    methodName: "tokenDetails",
    cardType: "PayWithAmazon",
    tokenId: response.id
})
```

**Need to determine:**
- Is this handled by Kibo platform or custom Arc.js code?
- Does it need updating for v2?
- Should it call `getCheckoutSessionDetails()` when token contains `checkoutSessionId`?

**Current Implementation:**
The frontend expects this API to return `tokenDetails` with:
- `shippingContact` - Address object
- `billingContact` - Billing address (if enabled)

For v2, this should call `getCheckoutSessionDetails()` when the token contains a checkout session ID.

## Configuration Requirements

### Secure App Data (context.getSecureAppData("awsConfig"))
**Required Fields:**
```javascript
{
  // Amazon Pay v2
  publicKeyId: "LIVE|SANDBOX-...",
  privateKey: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",

  // Legacy (can be removed after full migration)
  mwsAccessKeyId: "...",
  mwsSecret: "..."
}
```

### Payment Settings (from Admin UI)
```javascript
{
  credentials: [
    { apiName: "environment", value: "sandbox|production" },
    { apiName: "region", value: "us|uk|de|jp" },
    { apiName: "storeId", value: "amzn1.application-oa2-client..." },
    { apiName: "merchantId", value: "A..." },
    { apiName: "publicKeyId", value: "LIVE|SANDBOX-..." },
    { apiName: "orderProcessing", value: "AuthAndCaptureOnOrderPlacement|..." },
    { apiName: "billingAddressOption", value: "0|1|2" }
  ]
}
```

## Testing Checklist

### Endpoint Testing
- [ ] Checkout session endpoint returns valid signature
- [ ] Signature validates on Amazon's servers
- [ ] Payload contains correct `webCheckoutDetails.checkoutReviewReturnUrl`
- [ ] Payload contains correct `storeId`

### Checkout Flow Testing
- [ ] Button renders and redirects to Amazon
- [ ] Customer completes checkout on Amazon
- [ ] Redirect back includes `amazonCheckoutSessionId`
- [ ] Session retrieval works: `getCheckoutSession()`
- [ ] Shipping address parsed correctly
- [ ] Billing address parsed correctly (if enabled)
- [ ] Email captured correctly

### Payment Processing Testing
- [ ] Payment authorization works
- [ ] Payment capture works
- [ ] Void/cancel works
- [ ] Refund works
- [ ] Error handling works

## Build & Deployment

### Build the Application
```bash
cd ~/Projects/PayWithAmazon
grunt
```

This will:
1. Bundle all JavaScript modules
2. Create dist files for Arc.js manifests
3. Prepare for upload to Mozu Developer Center

### Deploy to Sandbox
1. Upload using `grunt watch` or manual upload
2. Install/update app in sandbox tenant
3. Configure Amazon Pay settings in Admin
4. Test checkout flow

## Known Issues / Questions

1. **Private Key Storage:** How is the private key securely stored in `awsConfig`? Is there a secure app data API?

2. **Token Details:** Where is `thirdPartyPaymentExecute` method="tokenDetails" implemented?

3. **Charge Permission ID:** Amazon Pay v2 uses "Charge Permission ID" - where should this be stored in the order/payment?

4. **Session Completion:** When should `completeCheckoutSession()` be called? During authorization or earlier?

5. **Multi-Ship:** Does multi-ship work the same way with checkout sessions?

## Next Steps

1. **Update paymenthelper.js** - Implement v2 charge/capture/refund methods
2. **Update amazonInstall.js** - Add v2 configuration fields
3. **Test checkout session endpoint** - Verify signature generation
4. **Test full checkout flow** - End-to-end with v2
5. **Update configuration in Admin** - Add v2 credentials
6. **Migrate existing data** - If needed

## Resources

- [Amazon Pay API v2 Documentation](https://developer.amazon.com/docs/amazon-pay-api-v2/introduction.html)
- [Amazon Pay SDK GitHub](https://github.com/amzn/amazon-pay-api-sdk-nodejs)
- [Checkout Session API Reference](https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html)
- [Charge API Reference](https://developer.amazon.com/docs/amazon-pay-api-v2/charge.html)

## Questions?

Contact the team or refer to the frontend migration document at:
`~/Projects/Mozu.SiteBuilder.Storefront/AMAZON_PAY_V2_MIGRATION.md`
