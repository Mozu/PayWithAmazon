var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var Guid = require('guid');
var amazonPay = require("./amazonpaysdk")();
var constants = require("mozu-node-sdk/constants");
var paymentConstants = require("./constants");
var orderClient = require("mozu-node-sdk/clients/commerce/order")();
var cartClient = require("mozu-node-sdk/clients/commerce/cart")();
var FulfillmentInfoClient = require('mozu-node-sdk/clients/commerce/orders/fulfillmentInfo')();
var helper = require("./helper");
var paymentHelper = require("./paymentHelper");

function createOrderFromCart(userId, cartId) {
  return cartClient.getOrCreateCart().then(function(cart) {
    return orderClient.createOrderFromCart({ cartId: cart.id  })
      .then(function(order) {
        console.log("Order created from cart");
        return order;
      });
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


function getAmazonOrderDetails(ctx, awsReferenceId, addressConsentToken) {
    return paymentHelper.getPaymentConfig(ctx)
    .then(function(config) {
        amazonPay.configure(config);
        return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken).then(function(order) {
            return {awsOrder :order.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails , config: config};
        });
    });
}

function getFulfillmentInfo(awsOrder,data, context) {

  var orderDetails = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails;
  var destinationPath = orderDetails.Destination.PhysicalDestination;
  try {
    var name =  destinationPath.Name;
    var nameSplit = name.split(/\s/);
    var firstName = nameSplit[0];
    var lastName = context.configuration.missingLastNameValue;
    if (nameSplit[1])
      lastName = destinationPath.Name.replace(nameSplit[0]+" ","").replace(nameSplit[0],"");
    var registeredUser = helper.getUserEmail(context);

    var phone = destinationPath.Phone;
   var contact = { "fulfillmentContact" : {
              "email" : registeredUser || orderDetails.Buyer.Email,
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


      contact.fulfillmentContact.firstName  = firstName;
      contact.fulfillmentContact.lastNameOrSurname = lastName;
      return contact;
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

      if (!helper.isAmazonCheckout(self.ctx) || (!helper.isCartPage(self.ctx)  && params.view == "amazon-checkout"))  self.cb();
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
          return createOrderFromCart(self.ctx.apiContext.userId, cartId);
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
      }).catch(function(e){
        console.error(e);
        context.cache.request.set("amazonError",e);
        self.cb();
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
    console.log("Reading payment settings for "+paymentConstants.PAYMENTSETTINGID);


    paymentHelper.getPaymentConfig(self.ctx)
    .then(function(config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(addressConsentToken);
    }).then(function(isTokenValid){

        console.log("isTokenValid", isTokenValid);
        if (isTokenValid) {
          console.log("Pay by Amazon token is valid...setting fulfilmment info");
          return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken);
        } else {
          console.error("Amazon session expired. Please re-login from cart page to continue checkout");
          throw new Error("Amazon session expired. Please re-login from cart page to continue checkout");
        }
    })
    .then(function(awsOrder) {
      var shippingAddress = getFulfillmentInfo(awsOrder, data, self.ctx);
      if (fulfillmentInfo.fulfillmentContact)
        shippingAddress.fulfillmentContact.email = fulfillmentInfo.fulfillmentContact.email || shippingAddress.email;

      self.ctx.request.params.fulfillmentInfo = shippingAddress;

      console.log("fulfillmentInfo from AWS", self.ctx.request.params.fulfillmentInfo );
      self.cb();
    }).catch(function(err) {
      console.error(err);
      self.cb(err);
    });
  };

  self.getBillingInfo = function(awsReferenceId, billingContact, context) {
    //var awsReferenceId = awsData.awsReferenceId;
    return getAmazonOrderDetails(self.ctx,awsReferenceId, null).then(function(data)  {
        if (!data.config.billingType || data.config.billingType === "0") return billingContact;

        var orderDetails = data.awsOrder;
        if (orderDetails.BillingAddress && orderDetails.BillingAddress.PhysicalAddress ) {
          var address = orderDetails.BillingAddress.PhysicalAddress;
          console.log("Amazon order", orderDetails);
          var parts = address.Name.split(/\s/);
          var firstName = parts[0];
          var lastName = address.Name.replace(parts[0]+" ","").replace(parts[0],"");
          billingContact.firstName  = firstName;
          billingContact.lastNameOrSurname = lastName;
          billingContact.phoneNumbers = {"home" : address.Phone ? address.phone : "N/A"};
          billingContact.address= {
                "address1": address.AddressLine1,
                "cityOrTown": address.City,
                "stateOrProvince": address.StateOrRegion,
                "postalOrZipCode": address.PostalCode,
                "countryCode": address.CountryCode,
                "addressType": 'Residential',
                "isValidated":  true
            };
        }
        console.log("billing contact", billingContact);
        return billingContact;
    }).catch(function(err) {
      console.error(err);
      return billingContact;
    });

  };

    self.validateAmazonOrder = function(awsReferenceId) {
        return getAmazonOrderDetails(self.ctx,awsReferenceId, null).then(function(data) {
            var orderDetails = data.awsOrder;
            console.log("Order status", orderDetails.OrderReferenceStatus);
            var state = orderDetails.OrderReferenceStatus.State;
            if (state === "Canceled" ) {
                console.log("Order status", "Amazon order "+awsReferenceId+" went into stale state");
                self.cb("Amazon order has timed out. Relogin from cart or checkout page");
            }

            //check constraints
            if (orderDetails.Constraints) {
                var paymentNotSet = _.find(orderDetails.Constraint, function(c) {
                                            return c.ConstraintID === "PaymentPlanNotSet";
                                        });
                if (paymentNotSet) {
                    console.log("Amazon payment not set", "Amazon order "+awsReferenceId+" payment not set");
                    self.cb("A valid payment has not been selected from Amazon. Please fix the issue before placing the order");
                }
            }
        }).catch(function(err) {
            console.error("Error validating aws order", err);
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

    if (!payment.externalTransactionId)
     payment.externalTransactionId = payment.billingInfo.externalTransactionId;
    if (!payment.externalTransactionId)
      throw new Error("PayWith Amazon Referenceid is missing");


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

  self.setError = function(context, callback, error) {
    console.log(err);
    context.cache.request.set("amazonError", err);
    callback();
  };
};
