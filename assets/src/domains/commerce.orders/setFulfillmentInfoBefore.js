/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


//var AmazonCheckout = require("../../amazoncheckout");


var AmazonCheckout = require("../../amazon/checkout");

module.exports = function(context, callback) {

	try {	
		//console.log(context.request.params);
		var amazonCheckout = new AmazonCheckout(context, callback);
	    amazonCheckout.addFulfillmentInfo();
    } catch(e) {
	   callback(e);
	}
  
};