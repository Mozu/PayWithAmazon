/**
 * Implementation for http.commerce.orders.setBillingInfo.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */

var AmazonCheckout = require("../../amazoncheckout");

module.exports = function(context, callback) {
	try{
		console.log("setBillingInfo.before action");
		var amazonCheckout = new AmazonCheckout(context, callback);
		amazonCheckout.addBillingInfo();
	} catch(e) {
		callback(e);
	} 
};