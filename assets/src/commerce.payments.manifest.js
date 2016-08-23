module.exports = {
  
  'embedded.commerce.payments.action.performPaymentInteraction': {
      actionName: 'embedded.commerce.payments.action.performPaymentInteraction',
      customFunction: require('./domains/commerce.payments/embedded.commerce.payments.action.performPaymentInteraction')
  },
  
  'amazonPaymentActionBefore': {
      actionName: 'embedded.commerce.payments.action.before',
      customFunction: require('./domains/commerce.payments/amazonPaymentActionBefore')
  },
  'amazonPaymentActionAfter': {
      actionName: 'embedded.commerce.payments.action.after',
      customFunction: require('./domains/commerce.payments/amazonPaymentActionAfter')
  }
};
