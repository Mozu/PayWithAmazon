var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var constants = require("mozu-node-sdk/constants");


var helper = module.exports = {
	createClientFromContext: function (client, context, removeClaims) { //used
	  var c = client(context);
	  if (removeClaims)
		  c.context[constants.headers.USERCLAIMS] = null;
	  return c;
	},
	validateUserSession : function(context) { //used
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
	isAmazonCheckout: function (context) { //used
	  var params = this.parseUrlParams(context);
	  var hasAmzParams = _.has(params, 'access_token') && _.has(params, "isAwsCheckout");
	  console.log("is Amazon checkout?", hasAmzParams);
	  return hasAmzParams;
	},
	parseUrlParams: function(context) { //used
		var request = context.request;
		var urlParseResult = url.parse(request.url);
		console.log("parsedUrl", urlParseResult);
		queryStringParams = qs.parse(urlParseResult.query);
		return queryStringParams;
	},
	isCartPage: function(context) { //used
		return context.request.url.indexOf("/cart") > -1;
	},
	isCheckoutPage: function(context) { //used
		return context.request.url.indexOf("/checkout") > -1;
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
