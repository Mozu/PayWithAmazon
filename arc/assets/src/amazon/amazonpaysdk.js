var crypto 	= require("crypto");
var moment 	= require("moment");
var _ 		= require("underscore");
var needle 	= require('needle');
var moment 	= require("moment");

var mwsServiceUrls = { "eu" : "mws-eu.amazonservices.com", "na" : "mws.amazonservices.com", "jp" : "mws.amazonservices.jp"  };
var profileEndpointUrls = { "uk" : "amazon.co.uk", "us" : "amazon.com", "de" : "amazon.de", "jp" : "amazon.co.jp" };
var regionMappings = {"de" : "eu", "uk" : "eu", "us" : "na", "jp" : "jp"};
var version = "2013-01-01";

var getBaseParams = function(action, config) {
	if (!config.mwsAccessKeyId || !config.mwsSecret)
		throw new Error("AWS Access KeyId or Secret not found");
	return {
		AWSAccessKeyId : config.mwsAccessKeyId,
		Action: action,
		SellerId: config.sellerId,
		MWSAuthToken: config.mwsAuthToken,
		SignatureMethod: "HmacSHA256",
		SignatureVersion: "2",
		Version: version
	};
};

var sortParams = function(params) {
	var keys = _.keys(params).sort();

	var sortObj = [];
	_.each(keys, function(key) {
	    sortObj[key] = params[key];
	});
	return sortObj;
};

var buildParamString = function(params, uriEncodeValues) {
	var keys = _.keys(params).sort();
	var paramStr = "";
	_.each(keys, function(key) {
		if (paramStr !== "")
			paramStr += "&";
	    paramStr += key+"=";
	    if (uriEncodeValues)
	    	paramStr += encodeURIComponent(params[key]);
	    else
	    	paramStr += params[key];
	});
	return paramStr;
};



var parseErrorToJson = function(error) {
	console.log("AWS Error ",error);
	return {
		type: error.ErrorResponse.Error.Type,
		code: error.ErrorResponse.Error.Code,
		message: error.ErrorResponse.Error.Message
	};

};


module.exports = function() {
	var self = this;

	self.configure = function(config) {
		self.config = config;
		self.config.profileEnvt = config.isSandbox ? "api.sandbox" : "api";
		path = config.isSandbox ? '/OffAmazonPayments_Sandbox' : '/OffAmazonPayments';
		self.config.path = path + "/" + version;
		self.config.server = mwsServiceUrls[regionMappings[config.region]];
		self.captureOnAuthorize = config.captureOnAuthorize;
	};

	self.executeRequest = function(action, params) {
		//add timestamp
		var utcTime = moment.utc();

		params = _.extendOwn(params, getBaseParams(action, self.config));
		params.Timestamp = utcTime.format('YYYY-MM-DDTHH:mm:ss')+"Z";

		params = sortParams(params);
		//sign the request
		var stringToSign = "POST";
		stringToSign += "\n";
		stringToSign += self.config.server;
		stringToSign += "\n";
		stringToSign += self.config.path;
		stringToSign += "\n";
		stringToSign += buildParamString(params, true);
		console.log("AWS Params to Sign", stringToSign);
		var signature = crypto.createHmac("sha256", self.config.mwsSecret).update(stringToSign).digest("base64");
		console.log("Aws Signature",signature);
		params.Signature = encodeURIComponent(signature);


		var promise = new Promise(function(resolve, reject) {
			needle.post("https://"+self.config.server+self.config.path,
			buildParamString(params, false),
			{json: false, parse: true, open_timeout: 60000},
			function(err, response, body) {
				if (response.statusCode != 200)
					reject(parseErrorToJson(response.body));
				else {
					resolve(body);
				}
			});
		});
		return promise;
	};


	self.validateToken = function(access_token) {
		var promise = new Promise(function(resolve, reject){
			self.getProfile(access_token).then(function(data) {
					resolve(true);
				}, function(err) {
					console.error("Validate token error", err);
					resolve(false);
				}
			);
		});
		return promise;
	};

	self.getProfile = function(access_token) {
		//access_token = encodeURIComponent(access_token);
		var promise = new Promise(function(resolve, reject) {
      console.log('get profile to validate access token');

			needle.get("https://"+self.config.profileEnvt+"."+profileEndpointUrls[self.config.region]+"/user/profile",{ headers: {'Authorization':'bearer '+access_token}},
				function(err, response, body){
					if (response.statusCode != 200)
						reject(response.body);
					else {
						resolve(body);
					}
				}
			);
		});
		return promise;
	};

	self.getOrderDetails = function(orderReferenceId, addressConsentToken) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;
		if (addressConsentToken)
			params.AddressConsentToken = addressConsentToken;

		return executeRequest("GetOrderReferenceDetails", params);
	};

	self.setOrderDetails = function(orderReferenceId, orderDetails) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;

		params['OrderReferenceAttributes.OrderTotal.Amount']=orderDetails.amount;
		params['OrderReferenceAttributes.OrderTotal.CurrencyCode']= orderDetails.currencyCode;
		params['OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId']=orderDetails.orderNumber;
		params['OrderReferenceAttributes.SellerOrderAttributes.StoreName']=orderDetails.websiteName;
		console.log("Setting AWS order orderDetails", params);
		return executeRequest("SetOrderReferenceDetails", params);
	};

	self.confirmOrder = function(orderReferenceId) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;
		console.log("Confirming AWS Order", params);
		return executeRequest("ConfirmOrderReference", params);
	};

	self.requestAuthorzation = function(orderReferenceId, amount, currencyCode, authorizationReferenceId,captureOnAuthorize, declineAuth) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;
		params['AuthorizationAmount.Amount'] = amount;
		params['AuthorizationAmount.CurrencyCode'] = currencyCode;
		params.AuthorizationReferenceId = authorizationReferenceId;
		if (captureOnAuthorize)
			params.CaptureNow = true;
		params.TransactionTimeout = 0;

		if (declineAuth)
			params.SellerAuthorizationNote = '{"SandboxSimulation": {"State":"Declined", "ReasonCode":"InvalidPaymentMethod", "PaymentMethodUpdateTimeInMins":5}}';

		console.log("Requesting AWS Authorization", params);
		return executeRequest("Authorize", params);
	};

	self.captureAmount = function(amazonAuthorizationId, orderDetails, authorizationReferenceId,declineCapture) {
		var params = {};
		params.AmazonAuthorizationId = amazonAuthorizationId;
		params['CaptureAmount.Amount']= orderDetails.captureAmount;
		params['CaptureAmount.CurrencyCode']=orderDetails.currencyCode;
		params.CaptureReferenceId=authorizationReferenceId;
		if (orderDetails.SellerCaptureNote)
			params.SellerCaptureNote=orderDetails.sellerCaptureNote;
		params['OrderReferenceAttributes.OrderTotal.Amount']=orderDetails.requestedAmount;
		params['OrderReferenceAttributes.OrderTotal.CurrencyCode']=orderDetails.currencyCode;
		params['OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId']=orderDetails.orderNumber;
		params['OrderReferenceAttributes.SellerOrderAttributes.StoreName']=orderDetails.websiteName;
		params.TransactionTimeout = 0;

		if (declineCapture)
			params.SellerCaptureNote = '{"SandboxSimulation": {"State":"Declined", "ReasonCode":"AmazonRejected"}}';

		console.log("Requesting AWS Capture", params);
		return executeRequest("Capture", params);
	};

	self.cancelOrder = function(orderReferenceId) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;
		return executeRequest("CancelOrderReference", params);
	};

	self.closeOrder = function(orderReferenceId) {
		var params = {};
		params.AmazonOrderReferenceId = orderReferenceId;
		return executeRequest("CloseOrderReference", params);
	};

	self.refund = function(captureId, refund, websiteName) {
		var params = {};
		params.AmazonCaptureId = captureId;
		params['RefundAmount.Amount'] = refund.amount;
		params['RefundAmount.CurrencyCode'] = refund.currencyCode;
		params.RefundReferenceId = refund.id;
		params['OrderReferenceAttributes.SellerOrderAttributes.StoreName'] = websiteName;
		params['OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId'] = refund.orderNumber;
		if (refund.note)
			params.SellerRefundNote = refund.note;
		console.log("AWS refund params", params);
		return executeRequest("Refund", params);
	};
	return self;
};
