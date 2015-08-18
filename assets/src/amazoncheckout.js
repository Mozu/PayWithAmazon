var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var xmlDoc = require("xmldoc");
var Guid = require('guid');
var amazonPay = require("./amazonpaysdk")();
var constants = require("mozu-node-sdk/constants");
var paymentConstants = require("./constants");
var orderClient = require("mozu-node-sdk/clients/commerce/order")();
var fulfillmentInfoClient = require('mozu-node-sdk/clients/commerce/orders/fulfillmentInfo')();
var paymentSettingsClient = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings")();
var generalSettingsClient = require('mozu-node-sdk/clients/commerce/settings/generalSettings')();
paymentSettingsClient.context[constants.headers.USERCLAIMS] = null;
generalSettingsClient.context[constants.headers.USERCLAIMS] = null;

function createOrderFromCart(cartId) {
  return orderClient.createOrderFromCart({ cartId: ''+cartId+''  }).then(function(order) {
    console.log("Order fulfillmentInfo" ,order.fulfillmentInfo);

    if (!order.fulfillmentInfo || !order.fulfillmentInfo.data || !order.fulfillmentInfo.data.awsReferenceId) return order;

    console.log("Order has AWS Data. validating AWS order");
    //already associated with an aws order...validate that it is not cancelled
    return amazonPay.getOrderDetails(order.fulfillmentInfo.data.awsReferenceId).then(function(awsOrder) {
        console.log("AWS Order", awsOrder);
        var doc = new xmlDoc.XmlDocument(awsOrder);
        var state = doc.valueWithPath("GetOrderReferenceDetailsResult.OrderReferenceDetails.OrderReferenceStatus.State");
        console.log("Aws Order status", state);
        if (state == "Canceled") {
          order.fulfillmentinfo = null;
          //console.log(order);
          //return orderClient.updateOrder({orderId: order.id, version: order.version},{body: order});
          return fulfillmentInfoClient.setFulFillmentInfo({orderId: order.id, version: order.version}, {body: {}}).then(function(result) {
             console.log("Updated order fulfillmentinfo", result);
              return order;
          });
        } else {
           console.log("AWS order is not canceled, returning order");
           return order;
        }
    });
  });      
}


function configure(continueIfDisabled, nameSpace, cb) {
   var promise = new Promise(function(resolve,reject) {
      var paymentFQN = nameSpace+"~"+paymentConstants.PAYMENTSETTINGID;
      console.log("Payment Namespace", paymentFQN);
      paymentSettingsClient.getThirdPartyPaymentWorkflowWithValues({fullyQualifiedName: paymentFQN})
      .then(function(paymentSetting) {
        if (!continueIfDisabled && !paymentSetting.isEnabled) cb();

        var environment = getValue(paymentSetting, paymentConstants.ENVIRONMENT);
        var isSandbox = environment == "sandbox";
        var region = getValue(paymentSetting, paymentConstants.REGION);
        var awsSecret = getValue(paymentSetting, paymentConstants.AWSSECRET);
        var awsAccessKeyId = getValue(paymentSetting, paymentConstants.AWSACCESSKEYID);
        var sellerId = getValue(paymentSetting, paymentConstants.SELLERID);
        var appId = getValue(paymentSetting, paymentConstants.APPID);
        var orderProcessing = getValue(paymentSetting, paymentConstants.ORDERPROCESSING);
        console.log("Order processing instrucions", orderProcessing);
        var captureOnAuthorize = (orderProcessing == paymentConstants.CAPTUREONSUBMIT);

        var config = {"isSandbox" : isSandbox, 
                      "awsAccessKeyId" : awsAccessKeyId, 
                          "awsSecret" : awsSecret,
                          "sellerId" : sellerId,
                          "region" : region,
                          "app_id" : appId,
                          "captureOnAuthorize": captureOnAuthorize };


        console.log("Amazon pay config", config);
        amazonPay.configure(config);
        resolve({enabled: paymentSetting.isEnabled, captureOnAuthorize: captureOnAuthorize});
      }, function(err) {
        reject(err);
      });
  });

  return promise;
}


function getFulfillmentInfo(awsOrder, data) {
  var doc = new xmlDoc.XmlDocument(awsOrder);

  console.log(doc.valueWithPath("GetOrderReferenceDetailsResult.OrderReferenceDetails.OrderReferenceStatus.State"));
  
  var destinationPath = "GetOrderReferenceDetailsResult.OrderReferenceDetails.Destination.PhysicalDestination";

  var name = doc.valueWithPath(destinationPath+".Name"); 
  var nameSplit = name.split(" ");
  var phone = doc.valueWithPath(destinationPath+".Phone");
  console.log(nameSplit);
  return { "fulfillmentContact" : { 
            "firstName" : (nameSplit[0] ? nameSplit[0] : "N/A"), 
            "lastNameOrSurname" : (nameSplit[1] ? nameSplit[1] : "N/A"), 
            "email" : doc.valueWithPath("GetOrderReferenceDetailsResult.OrderReferenceDetails.Buyer.Email"),
            "phoneNumbers" : {
              "home" : (phone ? phone : "N/A")
            },
            "address" : {
              "address1" : doc.valueWithPath(destinationPath+".AddressLine1"),
              "address2" : doc.valueWithPath(destinationPath+".AddressLine2"),
              "cityOrTown" : doc.valueWithPath(destinationPath+".City"),
              "stateOrProvince": doc.valueWithPath(destinationPath+".StateOrRegion"),
              "postalOrZipCode": doc.valueWithPath(destinationPath+".PostalCode"),
              "countryCode": doc.valueWithPath(destinationPath+".CountryCode"),
              "addressType": "Residential",
              "isValidated": "true"
            }
          },
          "data" : data
    };
}

function parseUrlParams(request) {
  var urlParseResult = url.parse(request.url);
  console.log("parsedUrl", urlParseResult);
  queryStringParams = qs.parse(urlParseResult.query);
  return queryStringParams;
}

function isAmazonCheckout(params) {
  var hasAmzParams = _.has(params, 'access_token') && _.has(params, "isAwsCheckout");
  console.log("is Amazon checkout?", hasAmzParams);
  return hasAmzParams;
}


function getValue(paymentSetting, key) {
  var value = _.findWhere(paymentSetting.credentials, {"apiName" : key});

    if (!value) {
      console.log(key+" not found");
      return;
    }
    //console.log("Key: "+key, value.value );
    return value.value;
}


function getOrderDetails(orderId) {
  return generalSettingsClient.getGeneralSettings().then(function(settings){
    return orderClient.getOrder({orderId: orderId}).then(function(order) {
      console.log("Site settings", settings);
      return {orderNumber: order.orderNumber, websiteName: settings.websiteName};
    });
  });
}

function createNewPayment(paymentAction, payment) {
  return getOrderDetails(payment.orderId).then(function(orderDetails) {
      orderDetails.amount = paymentAction.amount;
      orderDetails.currencyCode=  paymentAction.currencyCode;
      console.log("Order Details", orderDetails);
      return amazonPay.setOrderDetails(paymentAction.externalTransactionId, orderDetails).then(
        function(result) {
          console.log("Amazon Create new payment result", result);
          return { status : "New", amount: paymentAction.amount};
        }, function(err) {
          console.log("Amazon Create new payment Error", err);
          return { status : "Failed", responseText: err.message, responseCode: err.code};
        });
    });
}

function confirmAndAuthorize(paymentAction, payment, apiContext,captureOnAuthorize, declineAuth) {
  return amazonPay.confirmOrder(payment.externalTransactionId).then(function() {
      return amazonPay.requestAuthorzation(payment.externalTransactionId, payment.amountRequested, 
        apiContext.currencyCode, payment.id, captureOnAuthorize, declineAuth)
      .then(function(authResult) {
        console.log("Authorize result",authResult);
        var doc = new xmlDoc.XmlDocument(authResult);
        var state = doc.valueWithPath("AuthorizeResult.AuthorizationDetails.AuthorizationStatus.State");
        var status = "Declined";
        var awsTransactionId = doc.valueWithPath("AuthorizeResult.AuthorizationDetails.AmazonAuthorizationId");
        var captureId = null;
        if (state == "Open" || state == "Closed") status = "Authorized";
        if (captureOnAuthorize) {
          //status = "Captured";
          captureId = doc.valueWithPath("AuthorizeResult.AuthorizationDetails.IdList.member");
        }

        var response = {
              awsTransactionId: awsTransactionId,
              captureId: captureId,
              responseCode: 200, 
              responseText:  state, 
              status: status,
              amount: payment.amountRequested,
              captureOnAuthorize: captureOnAuthorize
            };
        console.log("Repsonse", authResult);
        return response;
      }, function(err) {
        console.log(err);
        return "Declined";
      });      
  }, function(err) {
      console.log("Amazon confirm order failed", err);
      return "Failed";
  });
}

function captureAmount(paymentAction, payment,declineCapture) {
  return getOrderDetails(payment.orderId).then(function(orderDetails) {
      
    orderDetails.requestedAmount = payment.requestedAmount;
    orderDetails.captureAmount= paymentAction.amount;
    orderDetails.currencyCode= paymentAction.currencyCode;
     
      
    console.log("Order details", orderDetails);
    var interactions = payment.interactions;

    var paymentAuthorizationInteraction = getInteractionByStatus(interactions, "Authorized");

    console.log("Authorized interaction",paymentAuthorizationInteraction );
    if (!paymentAuthorizationInteraction) {
      console.log("interactions", interactions);
      return {status : "Failed",
              responseText: "Amazon Authorization Id not found in payment interactions",
              responseCode: 500};
    }

    return amazonPay.captureAmount(paymentAuthorizationInteraction.gatewayTransactionId, orderDetails,
                                    getUniqueId() ,declineCapture)
      .then(function(captureResult){
        console.log("Capture Result", captureResult);
        var doc = new xmlDoc.XmlDocument(captureResult);
        var state = doc.valueWithPath("CaptureResult.CaptureDetails.CaptureStatus.State");
        var captureId = doc.valueWithPath("CaptureResult.CaptureDetails.AmazonCaptureId");

        var response = {
          status : (state == "Completed" ? "Captured" : "Failed"),
          awsTransactionId: captureId,
          responseText: state,
          responseCode: 200,
          amount: orderDetails.captureAmount
        };

        return response;
    }, function(err) {
      console.log("Capture Error", err);
      return {status : "Failed",
              responseText: err.message,
          responseCode: err.code};
    });
  });
}

function creditPayment(paymentAction, payment) {
  return getOrderDetails(payment.orderId).then(function(orderDetails) {
      var capturedInteraction = getInteractionByStatus(payment.interactions,"Captured");
      console.log("AWS Refund, previous capturedInteraction", capturedInteraction);
      if (!capturedInteraction) {
        return {status : "Failed", responseCode: "InvalidRequest", responseText: "Payment has not been captured to issue refund"};
      } 

      if (paymentAction.ManualGatewayInteraction) {
        console.log("Manual credit...dont send to amazon");
        return {amount: paymentAction.amount,gatewayResponseCode:  "OK", status: "Credited",
                awsTransactionId: paymentAction.manualGatewayInteraction.gatewayResponseCode  };
      }

      orderDetails.amount = paymentAction.amount;
      orderDetails.currencyCode = paymentAction.currencyCode;
      orderDetails.note = paymentAction.reason;
      orderDetails.id = getUniqueId();

      
      console.log("Refund details", orderDetails);     
      return amazonPay.refund(capturedInteraction.gatewayTransactionId, orderDetails).then(
       function(refundResult) {
          console.log("AWS Refund result", refundResult);
          var doc = new xmlDoc.XmlDocument(refundResult);
          var state = doc.valueWithPath("RefundResult.RefundDetails.RefundStatus.State");
          var refundId = doc.valueWithPath("RefundResult.RefundDetails.AmazonRefundId");

          var response = {
            status : ( state == "Pending" ? "CreditPending" : (state == "Completed" ? "Credited" : "Failed")),
            awsTransactionId: refundId,
            responseText: state,
            responseCode: 200,
            amount: refund.amount
          };
          console.log("Refund response", response);
          return response;
      }, function(err) {
        console.log("Capture Error", err);
        return {status : "Failed",
                responseText: err.message,
            responseCode: err.code};
      });
    });
}

function voidPayment(paymentAction, payment) {
  var promise = new Promise(function(resolve, reject) {
    if (paymentAction.ManualGatewayInteraction) {
          console.log("Manual void...dont send to amazon");
          resolve({amount: paymentAction.amount,gatewayResponseCode:  "OK", status: "Voided",
                  awsTransactionId: paymentAction.manualGatewayInteraction.gatewayResponseCode  });
    }

    var capturedInteraction = getInteractionByStatus(payment.interactions,"Captured");
    console.log("Void Payment - Captured interaction", capturedInteraction);
    if (capturedInteraction) {
      resolve({status : "Failed", responseCode: "InvalidRequest", responseText: "Payment with captures cannot be voided. Please issue a refund"});
    } 

    

    var authorizedInteraction = getInteractionByStatus(payment.interactions,"Authorized");
    if (!authorizedInteraction) 
      resolve( {status: "Voided"});

    return amazonPay.cancelOrder(payment.externalTransactionId).then(function(result) {
      console.log("Amazon cancel result", result);
      resolve( {status: "Voided"});
    }, function(err){
       console.log("Amazon cancel failed", err);
      response({status: "Failed"});
    });

  });
  return promise;
}


function declinePayment(payment) {
  var promise = new Promise(function(resolve, reject) {
    var capturedInteraction = getInteractionByStatus(payment.interactions, "Captured");
    if (capturedInteraction) {
      console.log("Capture found for payment, cannot decline");
      resolve({status: "Failed", responseCode: "InvalidRequest", responseText: "Payment with captures cannot be declined"});
    }

    amazonPay.cancelOrder(payment.externalTransactionId).then(function(result){
      console.log(result);
      resolve({status:"Declined"});
    }, function(err) {
      console.log(err);
      resolve({status:"Failed", responseText: err});
    });
  });
  return promise;
}

function getInteractionByStatus(interactions, status) {
  return _.find(interactions, function(interaction){
      return interaction.status == status;
  } );
}

function getUniqueId() {
  var guid = Guid.create();
  return guid.value.replace(/\-/g, "");
}

module.exports = function(context, callback) {
  var self = this;
  self.ctx = context;
  self.cb = callback;
  self.nameSpace = context.apiContext.appKey.split(".")[0];

  self.validateAndProcess = function() {
    try {
      var params = parseUrlParams(self.ctx.request);

      if (!isAmazonCheckout(params)) return self.cb();
      console.log(self.ctx.apiContext);
     
      configure(false, self.nameSpace, self.cb)
      .then(function(result) { 
        return amazonPay.validateToken(params.access_token); 
      }).then(function(isTokenValid) {
        console.log("Is Amazon token valid", isTokenValid);
        if (!isTokenValid && params.isAwsCheckout) self.cb("Could not validate Amazon auth token");

        var cartId = params.cartId;
        if (isTokenValid && cartId) {
          console.log("Converting cart to order", cartId);
          return createOrderFromCart(cartId);
        } else if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect('/cart');
          self.ctx.response.end();
        } 
      }).then(function(order) {
        console.log("Order created from cart", order.id);
        
           delete params.cartId;
          var queryString = "";
          Object.keys(params).forEach(function(key){
              if (queryString !== "")
                queryString += "&";
              queryString += key +"=" + params[key];
          });
        
        self.ctx.response.redirect('/checkout/'+order.id+"?"+queryString);
        self.ctx.response.end();
      })
      .then(self.cb, self.cb);      
    }
    catch (e) {
      self.cb(e);
    }
  };

  self.addViewData = function() {
    var params = parseUrlParams(self.ctx.request);
    self.ctx.response.viewData.payByAmazonId = paymentConstants.PAYMENTSETTINGID;

    if (!isAmazonCheckout(params)) return self.cb();


    configure(false, self.nameSpace, self.cb)
      .then(function(result) { 
        return amazonPay.validateToken(params.access_token); 
      }).then(function(isTokenValid) {
        if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect('/cart');
          self.ctx.response.end();
          self.cb();
        } else if (_.has(params, "view")) {
          console.log("Changing view name to amazonpay");
          self.ctx.response.viewName = params.view;

        }
        else
          self.ctx.response.viewData.awsCheckout = true;
      });

  };

  self.addBillingInfo = function() {
    console.log(self.ctx.request.params);
    var req = self.ctx.request;
    var billingInfo = req.params.newBillingInfo || req.params.billingInfo;
    if (billingInfo.paymentType !== paymentConstants.PAYMENTSETTINGID && billingInfo.paymentWorkflow !== paymentConstants.PAYMENTSETTINGID)
      self.cb();

    configure(false, self.nameSpace, self.cb)
    .then(function(result) {
      return fulfillmentInfoClient.getFulfillmentInfo({orderId: req.orderId});
    })
    .then(function(fulfillmentinfo){
      console.log(fulfillmentinfo);
      self.cb();
    }, self.cb);
  };

  self.addFulfillmentInfo = function() {
    console.log(self.ctx.request.params);

    var fulfillmentInfo = self.ctx.request.params.fulfillmentInfo;
    var data = fulfillmentInfo.data;
    if (!data) return self.cb();

    var awsReferenceId = data.awsReferenceId;
    var addressConsentToken = data.addressAuthorizationToken;

    if (!awsReferenceId && !addressConsentToken) { 
      console.log("not an amazon order...");
      return self.cb(); 
    }
    console.log("Reading payment settings for "+self.nameSpace+"~"+paymentConstants.PAYMENTSETTINGID);

    configure(false, self.nameSpace, self.cb)
    .then(function(result) { 
        return amazonPay.validateToken(addressConsentToken); 
    })
    .then(function(isTokenValid){
        if (!isTokenValid) self.cb();
        
        if (isTokenValid) {
          console.log("Pay by Amazon token is valid...setting fulfilmment info");
          return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken);
        } else {
          return self.cb("Amazon session expired. Please re-login from cart page to continue checkout");
        }
    })
    .then(function(awsOrder) {
      console.log("Aws order", awsOrder);
      self.ctx.request.params.fulfillmentInfo = getFulfillmentInfo(awsOrder, data);
      console.log("fulfillmentInfo from AWS", self.ctx.request.params.fulfillmentInfo );
      self.cb();
    }, self.cb);
  };

  self.processPayment = function() {
    var paymentAction = self.ctx.get.paymentAction();
    var payment = self.ctx.get.payment();    

    console.log("Payment Action", paymentAction);
    console.log("Payment", payment);
    console.log("apiContext", self.ctx.apiContext);
    if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID) return self.cb();
    var continueIfDisabled = paymentAction.actionName != "CreatePayment" && paymentAction.actionName != "AuthorizePayment";

    var declineAuth = false; //this is for siumulating auth failure
    var declineCapture = false; //this is for siumulating capture failure
    if (self.ctx.configuration && self.ctx.configuration.payment)
      declineAuth = self.ctx.configuration.payment.declineAuth === true;

    if (self.ctx.configuration && self.ctx.configuration.payment)
      declineCapture =  self.ctx.configuration.payment.declineCapture === true;

    console.log("Configuration", self.ctx.configuration);
    console.log("Decline Auth Simulate flag", declineAuth);
    console.log("Decline Capture Simulate flag", declineCapture);

    try {

       configure(continueIfDisabled,self.nameSpace, self.cb).then(function(result) {
          switch(paymentAction.actionName) {
            case "CreatePayment":
                console.log("adding new payment interaction for ", paymentAction.externalTransactionId);
                //Add Details
                return createNewPayment(paymentAction, payment);
            case "VoidPayment":
                console.log("Voiding payment interaction for ", payment.externalTransactionId);
                console.log("Void Payment", payment.id);
                return voidPayment(paymentAction, payment);
            case "AuthorizePayment":
                console.log("Authorizing payment for ", payment.externalTransactionId);
                return confirmAndAuthorize(paymentAction, payment, self.ctx.apiContext, result.captureOnAuthorize, declineAuth);
            case "CapturePayment":
                console.log("Capturing payment for ", payment.externalTransactionId);
                return captureAmount(paymentAction, payment,declineCapture);
            case "CreditPayment":
                console.log("Crediting payment for ", payment.externalTransactionId);
                return creditPayment(paymentAction, payment);
            case "DeclinePayment":
                console.log("Decline payment for ",payment.externalTransactionId);
                return declinePayment(payment);
            default:
              return null;
          }
      }).then(function(paymentResult) {
        if (!paymentResult) return self.cb(); 

        if (paymentResult.status == "New")
             self.ctx.exec.setPaymentAmountRequested(paymentAction.amount);

         var interaction  =  {status: paymentResult.status};
         if (paymentResult.amount) 
            interaction.amount = paymentResult.amount;

          if (paymentResult.awsTransactionId)
              interaction.gatewayTransactionId = paymentResult.awsTransactionId;

          if (paymentResult.responseText)
            interaction.gatewayResponseText= paymentResult.responseText;

          if (paymentResult.responseCode)
              interaction.gatewayResponseCode= paymentResult.responseCode;
          console.log("Payment Action result", interaction);
            
          self.ctx.exec.addPaymentInteraction(interaction);

          if (paymentResult.captureOnAuthorize) {
            interaction.gatewayTransactionId = paymentResult.captureId;
            interaction.status = "Captured";
            self.ctx.exec.addPaymentInteraction(interaction);
          }
          self.cb();
      }, function(err) {
        self.ctx.exec.addPaymentInteraction({ status: "Failed", 
                    gatewayResponseText: err
                  });
        self.cb(err);
      });
      //self.cb();

    } catch(e) {
      self.cb(e);
    }
  };


  self.closeOrder = function() {
    try {
      var mzOrder = self.ctx.get.order();
      if (mzOrder.status != "Completed") return self.cb();
        console.log("Order", mzOrder);
      //validate it is amazon payment
      var payment = _.find(mzOrder.payments, function(payment){
                        return payment.paymentType == paymentConstants.PAYMENTSETTINGID && payment.status=="Collected";
                    } );
      console.log("Amazon payment payment", payment);

      if (!payment) return self.cb();
      configure(true, self.nameSpace, self.cb).then(function(result){
        return amazonPay.getOrderDetails(payment.externalTransactionId);
      }).then(function(awsOrder) {
         var doc = new xmlDoc.XmlDocument(awsOrder);
         var state = doc.valueWithPath("GetOrderReferenceDetailsResult.OrderReferenceDetails.OrderReferenceStatus.State");
         console.log("Aws Order status", state);
         if (state != "Open") return;

          return amazonPay.closeOrder(payment.externalTransactionId).then(function(closeResult){
            console.log("Close AWS Oder result",closeResult);
          }, function(err) {
            console.log("Close Aws order error", err);
          });
      }).then(self.cb, self.cb);
    } catch(e) {
      self.cb(e);
    }
  };
};
