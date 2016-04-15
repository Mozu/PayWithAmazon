/**
 * Implementation for embedded.commerce.payments.action.before

 * This custom function will receive the following context object:
{
  "exec": {
    "setActionAmount": {
      "parameters": [
        {
          "name": "amount",
          "type": "number"
        }
      ],
      "return": {
        "type": "mozu.commerceRuntime.contracts.payments.paymentAction"
      }
    },
    "setPaymentData": {
      "parameters": [
        {
          "name": "key",
          "type": "string"
        },
        {
          "name": "value",
          "type": "object"
        }
      ]
    },
    "removePaymentData": {
      "parameters": [
        {
          "name": "key",
          "type": "string"
        }
      ]
    },
    "setActionPreAuthFlag": {
      "parameters": [
        {
          "name": "isPreAuth",
          "type": "bool"
        }
      ]
    }
  },
  "get": {
    "payment": {
      "parameters": [],
      "return": {
        "type": "mozu.commerceRuntime.contracts.payments.payment"
      }
    },
    "paymentAction": {
      "parameters": [],
      "return": {
        "type": "mozu.commerceRuntime.contracts.payments.paymentAction"
      }
    }
  }
}


 */

 var paymentConstants = require("../../amazon/constants");
 var _ = require("underscore");

module.exports = function(context, callback) {
    var payment = context.get.payment();
  if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID  && payment.paymentWorkflow !== paymentConstants.PAYMENTSETTINGID)
    callback();
  var order = context.get.order();

  var existingPayment = _.find(order.payments,function(payment) {
    return payment.paymentType === paymentConstants.PAYMENTSETTINGID  &&
            payment.paymentWorkflow === paymentConstants.PAYMENTSETTINGID &&
            payment.status === "Collected";   });

  var billingInfo = context.get.payment().billingInfo;
  if (existingPayment) {
    billingInfo.externalTransactionId = existingPayment.externalTransactionId;
    billingInfo.data = existingPayment.data;
    context.exec.setExternalTransactionId(billingInfo.externalTransactionId);
  } else {
    billingInfo.externalTransactionId = context.get.payment().externalTransactionId;
  }
  context.exec.setBillingInfo(billingInfo);

  callback();
};
