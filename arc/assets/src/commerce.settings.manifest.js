module.exports = {
  
  'amazonSettingValidator': {
      actionName: 'http.commerce.settings.checkout.paymentsettings.updatePaymentSettings.before',
      customFunction: require('./domains/commerce.settings/amazonSettingValidator')
  }
};
