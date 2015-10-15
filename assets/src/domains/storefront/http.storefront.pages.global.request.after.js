/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


var AmazonCheckout = require("../../amazon/checkout");
var helper = require("../../amazon/helper");

function addErrorToModel(context, error) {
    console.log("Adding error to viewData", error);
    context.response.viewData.model.messages =  [ 
      {"message": "'"+error+"'"}
    ];

}

module.exports = function(context, callback) {

  var amazonError = context.cache.request.get("amazonError");
  if (amazonError) addErrorToModel(context, amazonError);
  else {
    try {
      if ( helper.isCartPage(context) || helper.isCheckoutPage(context)) {
        var amazonCheckout = new AmazonCheckout(context, callback);
        amazonCheckout.addViewData();
      } 
      else
        callback();
    } catch(e) {
      addErrorToModel(context, e);
      callback();
    }
  }
};