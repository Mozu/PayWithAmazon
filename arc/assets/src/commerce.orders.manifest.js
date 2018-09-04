module.exports = {

  'processOrderActionAfter': {
      actionName: 'embedded.commerce.orders.action.after',
      customFunction: require('./domains/commerce.orders/processOrderActionAfter')
  },

  'amazonSetFulfillmentInfo': {
      actionName: 'http.commerce.orders.setFulFillmentInfo.before',
      customFunction: require('./domains/commerce.orders/setFulfillmentInfoBefore')
  }
};
