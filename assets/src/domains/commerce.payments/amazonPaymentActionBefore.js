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
var AmazonCheckout = require("../../amazon/checkout");
var _ = require("underscore");

module.exports = function (context, callback) {
  var payment = context.get.payment();
  var paymentAction = context.get.paymentAction();
  console.log(payment);
  if (
    payment.paymentType !== paymentConstants.PAYMENTSETTINGID &&
    payment.paymentWorkflow !== paymentConstants.PAYMENTSETTINGID
  )
    return callback();

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
    console.log("Payment before", paymentAction.actionName);
    var awsReferenceId = "";
    var checkoutSessionId = "";

    try {
      // Check for Amazon Pay v2 checkout session ID
      if (payment.data && payment.data.awsData) {
        checkoutSessionId = payment.data.awsData.checkoutSessionId;
        awsReferenceId = payment.data.awsData.awsReferenceId;
      }

      if (!checkoutSessionId && !awsReferenceId) {
        var newPayment = getPayment(order, "New");
        console.log(newPayment);
        if (newPayment) {
          awsReferenceId = newPayment.externalTransactionId;
        }
      }

      // Handle Amazon Pay v2 checkout session
      if (checkoutSessionId && paymentAction.actionName === "CreatePayment") {
        console.log("Processing Amazon Pay v2 checkout session:", checkoutSessionId);
        amazonCheckout
          .getBillingInfoFromSession(checkoutSessionId, billingInfo.billingContact)
          .then(function (billingContact) {
            billingInfo.billingContact = billingContact;
            billingInfo.externalTransactionId = checkoutSessionId;
            updateBillingInfo(context, callback, billingInfo);
          })
          .catch(function (error) {
            console.error("Error getting billing info from session:", error);
            callback(error);
          });
      }
      // Handle legacy Amazon Pay v1 order reference
      else if (awsReferenceId && paymentAction.actionName === "CreatePayment") {
        console.log("Processing legacy Amazon Pay v1 order reference:", awsReferenceId);
        amazonCheckout.validateAmazonOrder(awsReferenceId).then(function () {
          amazonCheckout
            .getBillingInfo(awsReferenceId, billingInfo.billingContact)
            .then(function (billingContact) {
              billingInfo.billingContact = billingContact;
              billingInfo.externalTransactionId = context.get.payment().externalTransactionId;
              updateBillingInfo(context, callback, billingInfo);
            });
        });
      } else {
        updateBillingInfo(context, callback, billingInfo);
      }
    } catch (e) {
      console.error("Amazon payment before", e);
      callback(e);
    }
  }
};

function getPayment(order, status) {
  console.log(order);
  return _.find(order.payments, function (payment) {
    return (
      payment.paymentType === paymentConstants.PAYMENTSETTINGID &&
      payment.paymentWorkflow === paymentConstants.PAYMENTSETTINGID &&
      payment.status === status
    );
  });
}

function updateBillingInfo(context, callback, billingInfo) {
  context.exec.setBillingInfo(billingInfo);
  callback();
}
