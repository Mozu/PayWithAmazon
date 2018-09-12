const crypto 		= require("crypto");
const moment 		= require("moment");
const _ 			= require("underscore");
const request   	= require("request-promise");
const parser 		= require('xml2json');
const mwsServiceUrls = { "eu" : "mws-eu.amazonservices.com", "na" : "mws.amazonservices.com", "jp" : "mws.amazonservices.jp"  };
const profileEndpointUrls = { "uk" : "amazon.co.uk", "us" : "amazon.com", "de" : "amazon.de", "jp" : "amazon.co.jp" };
const regionMappings = {"de" : "eu", "uk" : "eu", "us" : "na", "jp" : "jp"};
const version = "2013-01-01";

const getBaseParams = (action, config) => {
	if (!config.mwsAccessKeyId || !config.mwsSecret)
        throw new Error("AWS Access KeyId or Secret not found");

	const baseParams = {
		AWSAccessKeyId : config.mwsAccessKeyId,
		Action: action,
		SellerId: config.sellerId,
		MWSAuthToken: config.mwsAuthToken,
		SignatureMethod: "HmacSHA256",
		SignatureVersion: "2",
		Version: version
	};

	console.log("Base params", baseParams);

	return baseParams;
};

const sortParams = (params) => {
	var keys = _.keys(params).sort();

	var sortObj = [];
	_.each(keys, function(key) {
	    sortObj[key] = params[key];
	});
	return sortObj;
};

const buildParamString = (params, uriEncodeValues) => {
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

const parseErrorToJson = (error) => {
	const jsonError = parser.toJson(error, {"object": true});
	if (jsonError.ErrorResponse)
		return {
			type: jsonError.ErrorResponse.Error.Type,
			code: jsonError.ErrorResponse.Error.Code,
			message: jsonError.ErrorResponse.Error.Message
		};
	else
		return {
			type: "unknown",
			code: "unknown",
			message: jsonError.children
		};
};

const executeRequest = async (action, params, config) => {
    //add timestamp
    const utcTime = moment.utc();

    params = _.extendOwn(params, getBaseParams(action, config));
    params.Timestamp = utcTime.format('YYYY-MM-DDTHH:mm:ss')+"Z";

    params = sortParams(params);

	console.log("params", params);
    //const profileEnvt = config.isSandbox ? "api.sandbox" : "api";
    const path = (config.isSandbox ? '/OffAmazonPayments_Sandbox' : '/OffAmazonPayments')+"/"+version;
    const server = mwsServiceUrls[regionMappings[config.awsRegion]];

    console.log("path", path);
    console.log("server", server);


    //sign the request
    let stringToSign = "POST";
    stringToSign += "\n";
    stringToSign += server;
    stringToSign += "\n";
    stringToSign += path;
    stringToSign += "\n";
    stringToSign += buildParamString(params, true);
	const signature = crypto.createHmac("sha256", config.mwsSecret).update(stringToSign).digest("base64");
	
    params.Signature = encodeURIComponent(signature);

	const url = "https://"+server+path;
	console.log("Post url", url);
	try {
		const requestBody = buildParamString(params,false);
		let proxy = null;
		if (process.env.proxy)
			proxy =  "proxy: \""+process.env.proxy.trim()+"\"";
		const result = await request({ headers: {'Content-Length' : requestBody.length, 'Content-Type': 'application/x-www-form-urlencoded'},
									uri: url, method: 'POST', body: requestBody, proxy: "http://localhost:8888"});
		return parser.toJson(result, {"object": true});
	} catch(ex) {
		if (ex.response && ex.response.headers && ex.response.headers["content-type"] == "text/xml") {
			let error = parseErrorToJson(ex.error);
			error.remoteConnectionStatus = "Success";
			throw error;
		}
		else 
			throw {type:'network', code:'unknown', message:ex.message, remoteConnectionStatus: "Error"};
	}
}

const getOrderDetails = async (orderReferenceId, addressConsentToken, config) => {
    let params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    if (addressConsentToken)
        params.AddressConsentToken = addressConsentToken;

	return await executeRequest("GetOrderReferenceDetails", params, config);
};

const setOrderDetails = async (orderReferenceId, orderDetails, config) => {
	let params = {};
	params.AmazonOrderReferenceId = orderReferenceId;

	params['OrderReferenceAttributes.OrderTotal.Amount']=orderDetails.amount;
	params['OrderReferenceAttributes.OrderTotal.CurrencyCode']= orderDetails.currencyCode;
	params['OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId']=orderDetails.orderNumber;

	if (orderDetails.webSitenName);
		params['OrderReferenceAttributes.SellerOrderAttributes.StoreName']=orderDetails.websiteName;

	console.log("Setting AWS order orderDetails", params);
	return await executeRequest("SetOrderReferenceDetails", params, config);
};

const confirmOrder = async (orderReferenceId, config) => {
	let params = {};
	params.AmazonOrderReferenceId = orderReferenceId;
	console.log("Confirming AWS Order", params);
	return executeRequest("ConfirmOrderReference", params, config);
};

const requestAuthorzation = async (orderReferenceId, amount, currencyCode, authorizationReferenceId,captureOnAuthorize, config) => {
	let params = {};
	params.AmazonOrderReferenceId = orderReferenceId;
	params['AuthorizationAmount.Amount'] = amount;
	params['AuthorizationAmount.CurrencyCode'] = currencyCode;
	params.AuthorizationReferenceId = authorizationReferenceId;
	if (captureOnAuthorize)
		params.CaptureNow = true;

	params.TransactionTimeout = 0;

	//if (declineAuth)
	//	params.SellerAuthorizationNote = '{"SandboxSimulation": {"State":"Declined", "ReasonCode":"InvalidPaymentMethod", "PaymentMethodUpdateTimeInMins":5}}';

	console.log("Requesting AWS Authorization", params);
	return await executeRequest("Authorize", params, config);
};

const capture = async (amazonAuthorizationId, captureAmount, currencyCode,captureReferenceId,config)  =>{
	let params = {};
	params.AmazonAuthorizationId = amazonAuthorizationId;
	params['CaptureAmount.Amount']= captureAmount;
	params['CaptureAmount.CurrencyCode']=currencyCode;
	params.CaptureReferenceId=captureReferenceId;
	params.TransactionTimeout = 0;


	console.log("Requesting AWS Capture", params);
	return await executeRequest("Capture", params, config);
};

const cancelOrder = async (orderReferenceId, config) => {
	let params = {};
	params.AmazonOrderReferenceId = orderReferenceId;
	return await executeRequest("CancelOrderReference", params, config);
};

const closeOrder = async (orderReferenceId) => {
	let params = {};
	params.AmazonOrderReferenceId = orderReferenceId;
	return await executeRequest("CloseOrderReference", params);
};

const refund = async (captureId, refund, config )  => {
	let params = {};
	params.AmazonCaptureId = captureId;
	params['RefundAmount.Amount'] = refund.amount;
	params['RefundAmount.CurrencyCode'] = refund.currencyCode;
	params.RefundReferenceId = refund.id;
	params['OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId'] = refund.orderNumber;
	console.log("AWS refund params", params);
	return executeRequest("Refund", params,config);
};

const closeAuthorization = async(authorizationId, config) => {
	let params = {};
	params.AmazonAuthorizationId = authorizationId;
	console.log("AWS CloseAuthorization params", params);
	return executeRequest("CloseAuthorization", params,config);
}

const validateToken = async (access_token, config) => {
	return getProfile(access_token, config);
};

const getProfile = async (access_token, config) => {
	//const encodedAccessToken = encodeURIComponent(access_token);

	try {
		const url = "https://"+(config.isSandbox ? "api.sandbox" : "api")+"."+profileEndpointUrls[config.awsRegion]+"/user/profile";
		console.log('Profile Url', url);
		console.log("access_token", access_token);
		let proxy = null;
		if (process.env.proxy)
			proxy =  "proxy: \""+process.env.proxy.trim()+"\"";
		console.log(proxy);
		const result = await request({ headers: {'Authorization' : 'bearer '+access_token},uri: url, method: 'GET', proxy});

		return JSON.parse(result);
	} catch(ex) {
		if (ex.response && ex.response.headers && ex.response.headers["content-type"] == "application/json;charset=UTF-8") {
			ex = JSON.parse(ex);
			throw {remoteConnectionStatus : "Success", code:ex.error, message: ex.error_description};
		}
		else 
			throw {type:'network', code:'unknown', message:ex.message, remoteConnectionStatus: "Error"};
	}

};


module.exports.getOrderDetails = getOrderDetails;
module.exports.setOrderDetails = setOrderDetails;
module.exports.requestAuthorzation = requestAuthorzation;
module.exports.confirmOrder = confirmOrder;
module.exports.capture = capture;
module.exports.cancelOrder = cancelOrder;
module.exports.closeOrder = closeOrder;
module.exports.refund = refund;
module.exports.closeAuthorization = closeAuthorization;
module.exports.validateToken = validateToken;
module.exports.getProfile = getProfile;