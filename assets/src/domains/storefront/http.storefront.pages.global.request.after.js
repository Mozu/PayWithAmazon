/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


var AmazonCheckout = require("../../amazon/checkout");
var helper = require("../../amazon/helper");

function addErrorToModel(context,callback, error) {
    console.log("Adding error to viewData", error);
    var message = error;
    if (error.statusText)
      message = error.statusText;
    else if (error.message){
      message = error.message;
      if (message.errorMessage)
        message = message.errorMessage;
    }
    else if (error.errorMessage)
      message = error.errorMessage;
    /*context.response.model.messages =   [ 
      {"message": message}
    ];*/
    context.response.viewData.model.messages =  [ 
      {"message": "'"+message+"'"}
    ];
    callback();
}

module.exports = function(context, callback) {

  var amazonError = context.cache.request.get("amazonError");
  if (amazonError) addErrorToModel(context,callback, amazonError);
  else {
      if ( helper.isCartPage(context) || helper.isCheckoutPage(context)) {
        var amazonCheckout = new AmazonCheckout(context, callback);
        amazonCheckout.addViewData();
      } 
      else
        callback();
  }
};