
var getAppInfo = require('mozu-action-helpers/get-app-info');
var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var constants = require("mozu-node-sdk/constants");
var paymentConstants = require("./constants");
var GeneralSettings = require('mozu-node-sdk/clients/commerce/settings/generalSettings');
var Order = require("mozu-node-sdk/clients/commerce/order");
var Guid = require('guid');


var helper = module.exports = {
	createClientFromContext: function (client, context, removeClaims) {
	  var c = client(context);
	  if (removeClaims)
		  c.context[constants.headers.USERCLAIMS] = null;
	  return c;
	},
	validateUserSession : function(context) {
		var user = context.items.pageContext.user;
		if ( !user.isAnonymous && !user.IsAuthenticated ) 
		{
			self.ctx.response.redirect('/user/login?returnUrl=' + encodeURIComponent(context.request.url));
			return context.response.end();
		}
	},
	getPaymentFQN: function(context) {
		var appInfo = getAppInfo(context);
		return appInfo.namespace+"~"+paymentConstants.PAYMENTSETTINGID;
	},
	isAmazonCheckout: function (context) {
	  var params = this.parseUrlParams(context);
	  var hasAmzParams = _.has(params, 'access_token') && _.has(params, "isAwsCheckout");
	  console.log("is Amazon checkout?", hasAmzParams);
	  return hasAmzParams;
	},
	parseUrlParams: function(context) {
		var request = context.request;
		var urlParseResult = url.parse(request.url);
		console.log("parsedUrl", urlParseResult);
		queryStringParams = qs.parse(urlParseResult.query);
		return queryStringParams;
	},
	isCartPage: function(context) {
		return context.request.url.indexOf("/cart") > -1;
	},
	isCheckoutPage: function(context) {
		return context.request.url.indexOf("/checkout") > -1;
	},
	getOrderDetails: function(context, orderId) {
		var orderClient = this.createClientFromContext(Order,context);
		var generalSettingsClient = this.createClientFromContext(GeneralSettings, context, true);

	  	return generalSettingsClient.getGeneralSettings()
	  		.then(function(settings){
			    return orderClient.getOrder({orderId: orderId})
			    .then(function(order) {
			      return {orderNumber: order.orderNumber, websiteName: settings.websiteName};
			    });
	  		});
	},
	getUniqueId: function () {
	  var guid = Guid.create();
	  return guid.value.replace(/\-/g, "");
	}

};