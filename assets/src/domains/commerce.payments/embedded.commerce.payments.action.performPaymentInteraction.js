/**
 * Implementation for embedded.commerce.payments.action.performPaymentInteraction
 * This function will receive the following context object:

{
  &#34;exec&#34;: {
    &#34;addPaymentInteraction&#34;: {
      &#34;parameters&#34;: [
        {
          &#34;name&#34;: &#34;paymentInteraction&#34;,
          &#34;type&#34;: &#34;string&#34;
        }
      ],
      &#34;return&#34;: {
        &#34;type&#34;: &#34;mozu.commerceRuntime.contracts.payments.paymentInteraction&#34;
      }
    }
  },
  &#34;get&#34;: {
    &#34;payment&#34;: {
      &#34;parameters&#34;: [],
      &#34;return&#34;: {
        &#34;type&#34;: &#34;mozu.commerceRuntime.contracts.payments.payment&#34;
      }
    },
    &#34;paymentAction&#34;: {
      &#34;parameters&#34;: [],
      &#34;return&#34;: {
        &#34;type&#34;: &#34;mozu.commerceRuntime.contracts.payments.paymentAction&#34;
      }
    }
  }
}

 */

var AmazonCheckout = require("../../amazoncheckout");

module.exports = function(context, callback) {
  try {
    var amazonCheckout = new AmazonCheckout(context, callback);
    amazonCheckout.processPayment();
  } catch(e) {
    callback(e);
  }

  /*try {
    var payload = context.get.paymentAction();
    var payment = context.get.payment();    

    console.log("Billing Info", payload);
    console.log("payment", payment);

    if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID) return callback();

    switch(payload.actionName) {
      case "CreatePayment":

          console.log("adding new payment interaction for "+payload.externalTransactionId);
          context.exec.setPaymentAmountRequested(payload.amount);
          context.exec.addPaymentInteraction({status: "New"});
        break;
      case "VoidPayment":
          console.log("Voiding payment interaction for "+payment.externalTransactionId);
          console.log("Void Payment", payment.id);
          context.exec.addPaymentInteraction({status: "Voided"});
          break;
      default:
        break; 
    }

    callback();
  } catch(e) {
    callback(e);
  }*/
};