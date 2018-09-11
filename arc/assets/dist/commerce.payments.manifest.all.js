(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.index = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {
  'amazonPaymentActionBefore': {
      actionName: 'embedded.commerce.payments.action.before',
      customFunction: require('./domains/commerce.payments/amazonPaymentActionBefore')
  }
};

},{"./domains/commerce.payments/amazonPaymentActionBefore":2}],2:[function(require,module,exports){
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

 //var paymentConstants = require("../../amazon/constants");
 //var AmazonCheckout = require("../../amazon/checkout");
 //var _ = require("underscore");

module.exports = function(context, callback) {
    /*var payment = context.get.payment();
    var paymentAction = context.get.paymentAction();
    console.log(payment);
  if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID  && payment.paymentWorkflow !== paymentConstants.PAYMENTSETTINGID)
    callback();

  console.log("is For checkout", context.get.isForCheckout());
  
  var amazonCheckout = new AmazonCheckout(context, callback);
  var order = amazonCheckout.getOrder();

  var existingPayment = getPayment(order, "Collected");

  var billingInfo = context.get.payment().billingInfo;

  if (existingPayment) {
    billingInfo.externalTransactionId = existingPayment.externalTransactionId;
    billingInfo.data = existingPayment.data;
    context.exec.setExternalTransactionId(billingInfo.externalTransactionId);
    updateBillingInfo(context, callback, billingInfo);
  } else {

     console.log("Payment before",paymentAction.actionName );
     var awsReferenceId = "";

     try {
        if (payment.data && payment.data.awsData )
            awsReferenceId = payment.data.awsData.awsReferenceId;
        else
        {
            var newPayment =getPayment(order, "New");
            console.log(newPayment);
            if (newPayment)
                awsReferenceId = newPayment.externalTransactionId;
        }

        if (awsReferenceId && paymentAction.actionName === "CreatePayment") {
            amazonCheckout.validateAmazonOrder(awsReferenceId).then(function() {
                amazonCheckout.getBillingInfo(awsReferenceId, billingInfo.billingContact)
                .then(function(billingContact) {
                    billingInfo.billingContact = billingContact;
                    billingInfo.externalTransactionId = context.get.payment().externalTransactionId;
                    updateBillingInfo(context, callback, billingInfo);
                });
            });
        } else {
            updateBillingInfo(context, callback, billingInfo);
        }
     } catch(e) {
         console.error("Amazon payment before", e);
         callback(e);
     }
  }*/
  callback();
};


/*function getPayment(order, status) {
    console.log(order);
     return _.find(order.payments,function(payment) {
                                        return payment.paymentType === paymentConstants.PAYMENTSETTINGID  &&
                                                payment.paymentWorkflow === paymentConstants.PAYMENTSETTINGID &&
                                                payment.status === status;   });
}


function updateBillingInfo(context, callback, billingInfo) {
    context.exec.setBillingInfo(billingInfo);
     callback();
}*/

},{}]},{},[1])(1)
});