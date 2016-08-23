
 var paymentConstants = require("../../amazon/constants");
 var AmazonCheckout = require("../../amazon/checkout");
 var _ = require("underscore");

module.exports = function(context, callback) {
    /*var payment = context.get.payment();
    var paymentAction = context.get.paymentAction();
    console.log(payment);
    console.log(paymentAction);
    if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID  && payment.paymentWorkflow !== paymentConstants.PAYMENTSETTINGID)
        callback();
    
    
    if (paymentAction.actionName==="AuthorizePayment") {
        var failedInteraction = _.find(payment.interactions,function(interaction) {return interaction.status === paymentConstants.FAILED;   });
        console.log(failedInteraction);
        if (failedInteraction) {
           context.exec.setFailedStateName("New");
           return callback();
        }
    }*/
    callback();
   
};





