module.exports = {

  'amazonCartBefore': {
      actionName: 'http.storefront.pages.cart.request.before',
      customFunction: require('./domains/storefront/amazonCartBefore')
  },

  'amamzonCartAfter': {
      actionName: 'http.storefront.pages.cart.request.after',
      customFunction: require('./domains/storefront/amamzonCartAfter')
  },

  'amazonCheckoutBefore': {
      actionName: 'http.storefront.pages.checkout.request.before',
      customFunction: require('./domains/storefront/amazonCheckoutBefore')
  },

  'amazonCheckoutAfter': {
      actionName: 'http.storefront.pages.checkout.request.after',
      customFunction: require('./domains/storefront/amazonCheckoutAfter')
  },
  'checkoutSession': {
    actionName: 'http.storefront.routes',
    customFunction: require('./domains/storefront/amazonCheckoutSession')
  },
  'getCheckoutSessionData': {
    actionName: 'http.storefront.routes',
    customFunction: require('./domains/storefront/amazonGetCheckoutSessionData')
  },
  'updateCheckoutSession': {
    actionName: 'http.storefront.routes',
    customFunction: require('./domains/storefront/amazonUpdateCheckoutSession')
  }
};
