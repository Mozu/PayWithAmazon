var crypto = require("crypto");
var moment = require("moment");
var _ = require("underscore");
var needle = require("needle");
var moment = require("moment");

var mwsServiceUrls = {
  eu: "mws-eu.amazonservices.com",
  na: "mws.amazonservices.com",
  jp: "mws.amazonservices.jp",
};
var profileEndpointUrls = {
  uk: "amazon.co.uk",
  us: "amazon.com",
  de: "amazon.de",
  jp: "amazon.co.jp",
};
var regionMappings = { de: "eu", uk: "eu", us: "na", jp: "jp" };
var version = "2013-01-01";

var getBaseParams = function (action, config) {
  console.error("v1: Getting base params for action", action);
  if (!config.mwsAccessKeyId || !config.mwsSecret)
    throw new Error("AWS Access KeyId or Secret not found for action", action);
  return {
    AWSAccessKeyId: config.mwsAccessKeyId,
    Action: action,
    SellerId: config.sellerId,
    MWSAuthToken: config.mwsAuthToken,
    SignatureMethod: "HmacSHA256",
    SignatureVersion: "2",
    Version: version,
  };
};

var sortParams = function (params) {
  var keys = _.keys(params).sort();

  var sortObj = [];
  _.each(keys, function (key) {
    sortObj[key] = params[key];
  });
  return sortObj;
};

var buildParamString = function (params, uriEncodeValues) {
  var keys = _.keys(params).sort();
  var paramStr = "";
  _.each(keys, function (key) {
    if (paramStr !== "") paramStr += "&";
    paramStr += key + "=";
    if (uriEncodeValues) paramStr += encodeURIComponent(params[key]);
    else paramStr += params[key];
  });
  return paramStr;
};

var parseErrorToJson = function (error) {
  console.log("AWS Error ", error);
  if (error && error.ErrorResponse && error.ErrorResponse.Error)
    return {
      type: error.ErrorResponse.Error.Type,
      code: error.ErrorResponse.Error.Code,
      message: error.ErrorResponse.Error.Message,
    };
  return {
    type: "Unknown",
    code: "Unknown",
    message: typeof error === "string" ? error : "Amazon request failed",
  };
};

module.exports = function () {
  var self = {};

  self.configure = function (config) {
    self.config = config;
    self.config.profileEnvt = config.isSandbox ? "api.sandbox" : "api";
    var path = config.isSandbox
      ? "/OffAmazonPayments_Sandbox"
      : "/OffAmazonPayments";
    self.config.path = path + "/" + version;
    // config.region may be a v2-style code (NA/EU/JP); v1 endpoint maps need the raw key
    var v1Region = (config.v1Region || config.region || "us").toLowerCase();
    if (v1Region === "na") v1Region = "us";
    if (v1Region === "eu") v1Region = "uk";
    self.config.v1Region = v1Region;
    self.config.server = mwsServiceUrls[regionMappings[v1Region]];
    self.captureOnAuthorize = config.captureOnAuthorize;
  };

  self.executeRequest = function (action, params) {
    //add timestamp
    var utcTime = moment.utc();

    params = _.extendOwn(params, getBaseParams(action, self.config));
    params.Timestamp = utcTime.format("YYYY-MM-DDTHH:mm:ss") + "Z";

    params = sortParams(params);
    //sign the request
    var stringToSign = "POST";
    stringToSign += "\n";
    stringToSign += self.config.server;
    stringToSign += "\n";
    stringToSign += self.config.path;
    stringToSign += "\n";
    stringToSign += buildParamString(params, true);
    console.log("AWS signing request for action", action);
    var signature = crypto
      .createHmac("sha256", self.config.mwsSecret)
      .update(stringToSign)
      .digest("base64");
    params.Signature = encodeURIComponent(signature);

    var promise = new Promise(function (resolve, reject) {
      needle.post(
        "https://" + self.config.server + self.config.path,
        buildParamString(params, false),
        { json: false, parse: true, open_timeout: 60000 },
        function (err, response, body) {
          if (err) return reject(err);
          if (!response || response.statusCode != 200)
            reject(parseErrorToJson(body));
          else {
            resolve(body);
          }
        }
      );
    });
    return promise;
  };

  self.validateToken = function (access_token) {
    console.log("ValidatingToken");
    var promise = new Promise(function (resolve, reject) {
      self.getProfile(access_token).then(
        function (data) {
          resolve(true);
        },
        function (err) {
          console.error("Validate token error", err);
          resolve(false);
        }
      );
    });
    return promise;
  };

  self.getProfile = function (access_token) {
    //access_token = encodeURIComponent(access_token);
    var promise = new Promise(function (resolve, reject) {
      console.log("get profile to validate access token");

      needle.get(
        "https://" +
          self.config.profileEnvt +
          "." +
          profileEndpointUrls[self.config.v1Region] +
          "/user/profile",
        { headers: { Authorization: "bearer " + access_token } },
        function (err, response, body) {
          if (err) return reject(err);
          if (!response || response.statusCode != 200) reject(body);
          else {
            resolve(body);
          }
        }
      );
    });
    return promise;
  };

  self.getOrderDetails = function (orderReferenceId, addressConsentToken) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    if (addressConsentToken) params.AddressConsentToken = addressConsentToken;

    return self.executeRequest("GetOrderReferenceDetails", params);
  };

  self.setOrderDetails = function (orderReferenceId, orderDetails) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;

    params["OrderReferenceAttributes.OrderTotal.Amount"] = orderDetails.amount;
    params["OrderReferenceAttributes.OrderTotal.CurrencyCode"] =
      orderDetails.currencyCode;
    params["OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId"] =
      orderDetails.orderNumber;
    params["OrderReferenceAttributes.SellerOrderAttributes.StoreName"] =
      orderDetails.websiteName;
    console.log("Setting AWS order orderDetails", params);
    return self.executeRequest("SetOrderReferenceDetails", params);
  };

  self.confirmOrder = function (orderReferenceId) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    console.log("Confirming AWS Order", params);
    return self.executeRequest("ConfirmOrderReference", params);
  };

  self.requestAuthorzation = function (
    orderReferenceId,
    amount,
    currencyCode,
    authorizationReferenceId,
    captureOnAuthorize,
    declineAuth
  ) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    params["AuthorizationAmount.Amount"] = amount;
    params["AuthorizationAmount.CurrencyCode"] = currencyCode;
    params.AuthorizationReferenceId = authorizationReferenceId;
    if (captureOnAuthorize) params.CaptureNow = true;
    params.TransactionTimeout = 0;

    if (declineAuth)
      params.SellerAuthorizationNote =
        '{"SandboxSimulation": {"State":"Declined", "ReasonCode":"InvalidPaymentMethod", "PaymentMethodUpdateTimeInMins":5}}';

    console.log("Requesting AWS Authorization", params);
    return self.executeRequest("Authorize", params);
  };

  self.captureAmount = function (
    amazonAuthorizationId,
    orderDetails,
    authorizationReferenceId,
    declineCapture,
    pendingCapture
  ) {
    var params = {};
    params.AmazonAuthorizationId = amazonAuthorizationId;
    params["CaptureAmount.Amount"] = orderDetails.captureAmount;
    params["CaptureAmount.CurrencyCode"] = orderDetails.currencyCode;
    params.CaptureReferenceId = authorizationReferenceId;
    if (orderDetails.SellerCaptureNote)
      params.SellerCaptureNote = orderDetails.sellerCaptureNote;
    params["OrderReferenceAttributes.OrderTotal.Amount"] =
      orderDetails.requestedAmount;
    params["OrderReferenceAttributes.OrderTotal.CurrencyCode"] =
      orderDetails.currencyCode;
    params["OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId"] =
      orderDetails.orderNumber;
    params["OrderReferenceAttributes.SellerOrderAttributes.StoreName"] =
      orderDetails.websiteName;
    params.TransactionTimeout = 0;

    if (declineCapture)
      params.SellerCaptureNote =
        '{"SandboxSimulation": {"State":"Declined", "ReasonCode":"AmazonRejected"}}';
    else if(pendingCapture)
      params.SellerCaptureNote = '{"SandboxSimulation": {"State":"Pending"}}';
   
    console.log("Requesting AWS Capture", params);
    return self.executeRequest("Capture", params);
  };

  self.getCaptureDetails = function (amazonCaptureId) {
    var params = {};
    params.AmazonCaptureId = amazonCaptureId;  

    return self.executeRequest("GetCaptureDetails", params);
  };
  
  self.cancelOrder = function (orderReferenceId) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    return self.executeRequest("CancelOrderReference", params);
  };

  self.closeOrder = function (orderReferenceId) {
    var params = {};
    params.AmazonOrderReferenceId = orderReferenceId;
    return self.executeRequest("CloseOrderReference", params);
  };

  self.refund = function (captureId, refund, websiteName) {
    var params = {};
    params.AmazonCaptureId = captureId;
    params["RefundAmount.Amount"] = refund.amount;
    params["RefundAmount.CurrencyCode"] = refund.currencyCode;
    params.RefundReferenceId = refund.id;
    params[
      "OrderReferenceAttributes.SellerOrderAttributes.StoreName"
    ] = websiteName || refund.websiteName;
    params["OrderReferenceAttributes.SellerOrderAttributes.SellerOrderId"] =
      refund.orderNumber;
    if (refund.note) params.SellerRefundNote = refund.note;
    console.log("AWS refund params", params);
    return self.executeRequest("Refund", params);
  };
  return self;
};
