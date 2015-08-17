/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


var AmazonCheckout = require("../../amazoncheckout");



module.exports = function(context, callback) {
  try {
    if (context.request.url.indexOf("/cart") > -1) {
      var amazonCheckout = new AmazonCheckout(context, callback);
      amazonCheckout.validateAndProcess();
    }
    else
      callback();
  } catch(e) {
    callback(e);
  }
  
};