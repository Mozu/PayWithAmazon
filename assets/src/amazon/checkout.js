var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var Guid = require('guid');
var amazonPay = require("./amazonpaysdk")();
var constants = require("mozu-node-sdk/constants");
var paymentConstants = require("./constants");
var orderClient = require("mozu-node-sdk/clients/commerce/order")();
var FulfillmentInfoClient = require('mozu-node-sdk/clients/commerce/orders/fulfillmentInfo')();
var helper = require("./helper");
var paymentHelper = require("./paymentHelper");

function createOrderFromCart(cartId) {
  return orderClient.createOrderFromCart({ cartId: ''+cartId+''  }).then(function(order) {
    console.log("Order created from cart", order);
    return order;
  }).then(function(order){
    console.log("Order fulfillmentInfo" ,order.fulfillmentInfo);

    if (!order.fulfillmentInfo || !order.fulfillmentInfo.data || !order.fulfillmentInfo.data.awsReferenceId) return order;

    console.log("Order has AWS Data. validating AWS order");
    //already associated with an aws order...validate that it is not cancelled
    return amazonPay.getOrderDetails(order.fulfillmentInfo.data.awsReferenceId).then(function(awsOrder) {
        var orderDetails = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails;
        console.log("AWS Order", orderDetails);
        var state = orderDetails.OrderReferenceStatus.State;
        console.log("Aws Order status", state);
        if (state == "Canceled") {
          order.fulfillmentinfo = null;
          return FulfillmentInfoClient.setFulFillmentInfo({orderId: order.id, version: order.version}, {body: {}}).then(function(result) {
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


function getFulfillmentInfo(awsOrder,data) {
 
  var orderDetails = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails;
  var destinationPath = orderDetails.Destination.PhysicalDestination;
  try {
    var name =  destinationPath.Name;
    var nameSplit = name.split(" ");
    var phone = destinationPath.Phone;
    return { "fulfillmentContact" : { 
              "firstName" : (nameSplit[0] ? nameSplit[0] : "N/A"), 
              "lastNameOrSurname" : (nameSplit[1] ? nameSplit[1] : "N/A"), 
              "email" : orderDetails.Buyer.Email,
              "phoneNumbers" : {
                "home" : (phone ? phone : "N/A")
              },
              "address" : {
                "address1" : destinationPath.AddressLine1,
                "address2" : destinationPath.AddressLine2,
                "cityOrTown" : destinationPath.City,
                "stateOrProvince": destinationPath.StateOrRegion,
                "postalOrZipCode": destinationPath.PostalCode,
                "countryCode": destinationPath.CountryCode,
                "addressType": "Residential",
                "isValidated": "true"
              }
            },
            "data" : data
      };
  } catch(e) {
    console.log(e);
    new Error(e);
  }
}

module.exports = function(context, callback) {
  var self = this;
  self.ctx = context;
  self.cb = callback;

  self.validateUserSession = function() {
    var user = self.ctx.items.pageContext.user;
    if ( !user.isAnonymous && !user.IsAuthenticated )
    {
      self.ctx.response.redirect('/user/login?returnUrl=' + encodeURIComponent(context.request.url));
      return context.response.end();
    }
  };

  // Validate if the checkout process is for amazon process.
  // Convert cart to order
  // redirect to checkout page
  self.validateAndProcess = function() {
      var params = helper.parseUrlParams(self.ctx);

      if (!helper.isAmazonCheckout(self.ctx))  self.cb();
      console.log(self.ctx.apiContext);
     

      return paymentHelper.getPaymentConfig(self.ctx).
      then(function(config) { 
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(params.access_token); 
      }).then(function(isTokenValid) {
        console.log("Is Amazon token valid", isTokenValid);

        var cartId = params.cartId;
        if (isTokenValid && cartId) {

          //validate user claims
          helper.validateUserSession(self.ctx);

          console.log("Converting cart to order", cartId);
          return createOrderFromCart(cartId);
        } else if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect('/cart');
          return self.ctx.response.end();
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
      });//.then(self.cb, self.cb);   
  };

  //Add view data to control theme flow
  //Check if token expired before getting fulfillment info. if token expired redirect to cart page for re-authentication
  self.addViewData = function() {
    var params = helper.parseUrlParams(self.ctx);

    if (!helper.isAmazonCheckout(self.ctx)) return self.cb();

    paymentHelper.getPaymentConfig(self.ctx).
    then(function(config) { 
       if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(params.access_token); 
      }).then(function(isTokenValid) {
        console.log("is token valid", isTokenValid);
        if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect('/cart');
          self.ctx.response.end();
        } else if (_.has(params, "view")) {
          console.log("Changing view name to amazonpay");
          self.ctx.response.viewName = params.view;
        }
        else
          self.ctx.response.viewData.awsCheckout = true;
        self.cb();
      }).catch(function(err) {
        console.error(err);
        self.cb(err);
      });

  };


  // Get full shipping information from amazon. need a valid token to get full shipping details from amazon
  // Aws Referenceid and token is passed in fulfillmentInfo.data object
  // update request params with new fulfillmentinfo
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


    paymentHelper.getPaymentConfig(self.ctx)
    .then(function(config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(addressConsentToken); 
    }).then(function(isTokenValid){
        if (!isTokenValid) self.cb();
        
        if (isTokenValid) {
          console.log("Pay by Amazon token is valid...setting fulfilmment info");
          return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken);
        } else {
          throw new Error("Amazon session expired. Please re-login from cart page to continue checkout");
        }
    })
    .then(function(awsOrder) {
      self.ctx.request.params.fulfillmentInfo = getFulfillmentInfo(awsOrder, data);
      console.log("fulfillmentInfo from AWS", self.ctx.request.params.fulfillmentInfo );
      self.cb();
    }).catch(function(err) {
      console.error(err);
      self.cb(err);
    });
  };

  //Process payment interactions
  self.processPayment = function() {
    var paymentAction = self.ctx.get.paymentAction();
    var payment = self.ctx.get.payment();    

    console.log("Payment Action", paymentAction);
    console.log("Payment", payment);
    console.log("apiContext", self.ctx.apiContext);
    if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID) return self.cb();

    if (self.ctx.configuration && self.ctx.configuration.payment)
      declineCapture =  self.ctx.configuration.payment.declineCapture === true;

    try {

       paymentHelper.getPaymentConfig(self.ctx).then(function(config) {
          //amazonPay.configure(config);
          switch(paymentAction.actionName) {
            case "CreatePayment":
                console.log("adding new payment interaction for ", paymentAction.externalTransactionId);
                //Add Details
                return paymentHelper.createNewPayment(self.ctx, config, paymentAction, payment);
            case "VoidPayment":
                console.log("Voiding payment interaction for ", payment.externalTransactionId);
                console.log("Void Payment", payment.id);
                return paymentHelper.voidPayment(self.ctx, config, paymentAction, payment);
            case "AuthorizePayment":
                console.log("Authorizing payment for ", payment.externalTransactionId);
                return paymentHelper.confirmAndAuthorize(self.ctx, config, paymentAction, payment);
            case "CapturePayment":
                console.log("Capture payment for ", payment.externalTransactionId);
                return paymentHelper.captureAmount(self.ctx, config, paymentAction, payment);
            case "CreditPayment":
                console.log("Crediting payment for ", payment.externalTransactionId);
                return paymentHelper.creditPayment(self.ctx, config, paymentAction, payment);
            case "DeclinePayment":
                console.log("Decline payment for ",payment.externalTransactionId);
                return paymentHelper.declinePayment(self.ctx, config, paymentAction, payment);
            default:
              return {status: paymentConstants.FAILED,responseText: "Not implemented", responseCode: "NOTIMPLEMENTED"};
          }
      }).then(function(paymentResult) {
        console.log(paymentResult);
        paymentHelper.processPaymentResult(self.ctx,paymentResult, paymentAction);
        self.cb();
      }).catch(function(err){
        console.error(err);
        self.ctx.exec.addPaymentInteraction({ status: paymentConstants.FAILED, gatewayResponseText: err});
        self.cb(err);
      }).catch(function(err) {
        console.error(err);
        self.cb(err);
      });
    } catch(e) {
      console.error(e);
      self.cb(e);
    }
  };


  //Close the order in amazon once the order has been marked as completed in mozu
  self.closeOrder = function() {
    var mzOrder = self.ctx.get.order();
    if (mzOrder.status != "Completed") return self.cb();
      console.log("Order", mzOrder);
    //validate it is amazon payment
    var payment = _.find(mzOrder.payments, function(payment){
                      return payment.paymentType == paymentConstants.PAYMENTSETTINGID && payment.status=="Collected";
                  } );
    console.log("Amazon payment payment", payment);

    if (!payment) return self.cb();
    paymentHelper.getPaymentConfig(self.ctx).then(function(config) {
        amazonPay.configure(config);
        return amazonPay.getOrderDetails(payment.externalTransactionId);
    }).then(function(awsOrder) {
       var state = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails.OrderReferenceStatus.State;
       console.log("Aws Order status", state);
       if (state != "Open") return;

        return amazonPay.closeOrder(payment.externalTransactionId).then(function(closeResult){
          console.log("Close AWS Oder result",closeResult);
        }, function(err) {
          console.log("Close Aws order error", err);
        });
    }).then(self.cb, self.cb);
  };
};
