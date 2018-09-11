var helper = require("./helper");
var tokenApi = require('mozu-node-sdk/clients/commerce/payments/publicToken')();
var checkoutApi = require('mozu-node-sdk/clients/commerce/checkout')();
var orderApi = require('mozu-node-sdk/clients/commerce/order')();
var cartApi = require('mozu-node-sdk/clients/commerce/cart')();
var fulfillmentInfoApi = require('mozu-node-sdk/clients/commerce/orders/fulfillmentInfo')();
var generalSettings = require('mozu-node-sdk/clients/commerce/settings/generalSettings');

function getCheckoutSettings(context) {
  var client = helper.createClientFromContext(generalSettings,context, true);
  return client.getGeneralSettings().then(function(setting){
    return setting;
  });
}

function createCheckoutFromCart(userId, cartId){
  return checkoutApi.createCheckoutFromCart({cartId: cartId}).then(function(checkout){
    console.log("Checkout created from cart");

    if (!checkout.data || !checkout.data.awsReferenceId) return checkout;

    console.log("Checkout has AWS Data. validating AWS order");
    //already associated with an aws order...validate that it is not cancelled
    return tokenApi.execute({cardType: "PAYWITHAMAZON"}, {body: {methodName: "validateToken", body:{ token: {awsReferenceId: checkout.data.awsReferenceId}}}}).then(function(awsOrder) {
        var state = awsOrder.State;
        console.log("Aws Order status", state);
        if (state == "Canceled") {
          checkout.data.awsReferenceId = null;

          
          return checkoutApi.updateCheckout({checkoutId: checkout.id}, {body: checkout}).then(function(checkout) {
              return checkout;
          });
        } else {
           console.log("AWS order is not canceled, returning order");
           return checkout;
        }
    });
  });
}

function createOrderFromCart() {
  return cartApi.getOrCreateCart().then(function(cart) {
    return orderApi.createOrderFromCart({ cartId: cart.id  })
      .then(function(order) {
        console.log("Order created from cart");
        return order;
      });
  }).then(function(order){
    console.log("Order fulfillmentInfo" ,order.fulfillmentInfo);

    if (!order.fulfillmentInfo || !order.fulfillmentInfo.data || !order.fulfillmentInfo.data.awsReferenceId) return order;

    console.log("Order has AWS Data. validating AWS order");
    //already associated with an aws order...validate that it is not cancelled
    return tokenApi.execute({cardType: "PAYWITHAMAZON"}, {body: {methodName: "validateToken", body:{ token: {awsReferenceId: order.fulfillmentInfo.data.awsReferenceId}}}}).then(function(awsOrder) {
        var state = awsOrder.State;
        console.log("Aws Order status", state);
        if (state == "Canceled") {
          order.fulfillmentinfo = null;
          return fulfillmentInfoApi.setFulFillmentInfo({orderId: order.id, version: order.version}, {body: {}}).then(function(result) {
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

var validateAndProcess = function(context, callback) {
    //return new Promise(function(resolve, reject) {
      var params = helper.parseUrlParams(context);

      if (!helper.isAmazonCheckout(context) || (!helper.isCartPage(context)  && params.view == "amazon-checkout"))  callback();
      console.log(context.apiContext);
      var isMultishipEnabled = false;
  
       return tokenApi.execute({cardType: "PAYWITHAMAZON"}, {body: {methodName: "validateToken", body:{ access_token: params.access_token } }})
        .then(function(tokenResponse) {
          console.log('token response', tokenResponse);
          var isTokenValid = tokenResponse.user_id;
          console.log("Is Amazon token valid", isTokenValid);
  
          var cartId = params.cartId;
          if (isTokenValid && cartId) {
  
            //validate user claims
            helper.validateUserSession(context);
            return getCheckoutSettings(context).then(function(siteSettings){
  
              if (!siteSettings.isMultishipEnabled) {
                console.log("Converting cart to order", cartId);
                return createOrderFromCart();
              } else {
                console.log("Converting cart to checkout", cartId);
                isMultishipEnabled = true;
                return createCheckoutFromCart(context.apiContext.userId, cartId);              
              }
            });
  
          } else if (!isTokenValid) {
            console.log("Amazon token and expried, redirecting to cart");
            context.response.redirect('/cart');
            context.response.end();
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
  
          if (isMultishipEnabled)
            context.response.redirect('/checkoutV2/'+order.id+"?"+queryString);
          else
            context.response.redirect('/checkout/'+order.id+"?"+queryString);
  
          context.response.end();
        }).catch(function(err) {
          console.log(err);
          throw err;
        });
    //});
 };



var setError = function(error,context, callback)  {
  console.log(error);
  context.cache.request.set("amazonError", error);
  callback();
};


var addViewData = function(context, callback) {
  var params = helper.parseUrlParams(context);

  if (!helper.isAmazonCheckout(context)) return callback();

  tokenApi.execute({cardType: "PAYWITHAMAZON"}, {body: {methodName: "validateToken", body:{ access_token: params.access_token } }})
        .then(function(tokenResponse) {
            if (!tokenResponse.user_id) {
              console.log("Amazon token and expried, redirecting to cart");
              context.response.redirect('/cart');
              context.response.end();      
            } else {
              console.log("Changing view name to amazonpay");
              context.response.viewName = params.view;      
            }
            callback();
        }).catch(function(err) {
          console.error(err);
          callback(err);
        });
};


module.exports.validateAndProcess = validateAndProcess;
module.exports.setError = setError;
module.exports.addViewData = addViewData;
