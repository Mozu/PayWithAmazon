
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
      console.log(context.configuration);
      var allowWarmCheckout = (context.configuration && context.configuration.allowWarmCheckout);
      var redirectUrl = '/user/login?returnUrl=' + encodeURIComponent(context.request.url);
      if (!allowWarmCheckout)
        redirectUrl = '/logout?returnUrl=' + encodeURIComponent(context.request.url)+"&saveUserId=true";
			context.response.redirect(redirectUrl);
			return context.response.end();
		}
	},
  getUserEmail : function(context) {
    if (!context.items || !context.items.pageContext || !context.items.pageContext.user) return null;
    var user = context.items.pageContext.user;
    console.log("user", user);
    if ( !user.isAnonymous && user.IsAuthenticated ) {
      console.log(user);
      return user.email;
    }
    return null;
  },
	getPaymentFQN: function(context) {
		var appInfo = getAppInfo(context);
		console.log("App Info", appInfo);
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
			      return {orderNumber: order.orderNumber, websiteName: settings.websiteName, payments: order.payments};
			    });
	  		});
	},
	getUniqueId: function () {
	  var guid = Guid.create();
	  return guid.value.replace(/\-/g, "");
	},
	getValue: function(paymentSetting, key) {
	  var value = _.findWhere(paymentSetting.credentials, {"apiName" : key}) || _.findWhere(paymentSetting.Credentials, {"APIName" : key});

	    if (!value) {
	      console.log(key+" not found");
	      return;
	    }
	    //console.log("Key: "+key, value.value );
	    return value.value || value.Value;
	},
	addErrorToModel: function(context, callback, err) {
	    console.error("Adding error to viewData", err);
	    var message = err;
	    if (err.statusText)
	      message = err.statusText;
      else if (err.originalError) {
          console.error("originalError", err.originalError);
          if (err.originalError.items && err.originalError.items.length > 0)
            message = err.originalError.items[0].message;
          else
           message = err.originalError.message;
      }
	    else if (err.message){
	      message = err.message;
	      if (message.errorMessage)
	        message = message.errorMessage;
	    }
	    else if (err.errorMessage)
	      message = err.errorMessage;
	    context.response.viewData.model.messages =  [
	      {"message": message}
	    ];
	    callback();
	}

};
