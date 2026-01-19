var url = require("url");
var qs = require("querystring");
var _ = require("underscore");
var Guid = require("guid");
var amazonPay = require("./amazonpaysdk")();
var amazonPayV2 = require("./amazonpaysdkv2")();
var constants = require("mozu-node-sdk/constants");
var paymentConstants = require("./constants");
var orderClient = require("mozu-node-sdk/clients/commerce/order")();
var cartClient = require("mozu-node-sdk/clients/commerce/cart")();
var FulfillmentInfoClient = require("mozu-node-sdk/clients/commerce/orders/fulfillmentInfo")();
var checkoutClient = require("mozu-node-sdk/clients/commerce/checkout")();
var generalSettings = require("mozu-node-sdk/clients/commerce/settings/generalSettings");
var helper = require("./helper");
var paymentHelper = require("./paymenthelper");

function getCheckoutSettings(context) {
  var client = helper.createClientFromContext(generalSettings, context, true);
  return client.getGeneralSettings().then(function (setting) {
    return setting;
  });
}

function createCheckoutFromCart(userId, cartId) {
  return checkoutClient
    .createCheckoutFromCart({ cartId: cartId })
    .then(function (checkout) {
      console.log("Checkout created from cart");

      if (!checkout.data || !checkout.data.awsReferenceId) return checkout;

      console.log("Checkout has AWS Data. validating AWS order");
      //already associated with an aws order...validate that it is not cancelled
      return amazonPay
        .getOrderDetails(checkout.data.awsReferenceId)
        .then(function (awsOrder) {
          var orderDetails =
            awsOrder.GetOrderReferenceDetailsResponse
              .GetOrderReferenceDetailsResult.OrderReferenceDetails;
          console.log("AWS Order", orderDetails);
          var state = orderDetails.OrderReferenceStatus.State;
          console.log("Aws Order status", state);
          if (state == "Canceled") {
            checkout.data.awsReferenceId = null;

            return checkoutClient
              .updateCheckout({ checkoutId: checkout.id }, { body: checkout })
              .then(function (checkout) {
                return checkout;
              });
          } else {
            console.log("AWS order is not canceled, returning order");
            return checkout;
          }
        });
    });
}

function createOrderFromCart(userId, cartId) {
  return cartClient
    .getOrCreateCart()
    .then(function (cart) {
      return orderClient
        .createOrderFromCart({ cartId: cart.id })
        .then(function (order) {
          console.log("Order created from cart");
          return order;
        });
    })
    .then(function (order) {
      console.log("Order fulfillmentInfo", order.fulfillmentInfo);

      if (
        !order.fulfillmentInfo ||
        !order.fulfillmentInfo.data ||
        !order.fulfillmentInfo.data.awsReferenceId
      )
        return order;

      console.log("Order has AWS Data. validating AWS order");
      //already associated with an aws order...validate that it is not cancelled
      return amazonPay
        .getOrderDetails(order.fulfillmentInfo.data.awsReferenceId)
        .then(function (awsOrder) {
          var orderDetails =
            awsOrder.GetOrderReferenceDetailsResponse
              .GetOrderReferenceDetailsResult.OrderReferenceDetails;
          console.log("AWS Order", orderDetails);
          var state = orderDetails.OrderReferenceStatus.State;
          console.log("Aws Order status", state);
          if (state == "Canceled") {
            order.fulfillmentinfo = null;
            return FulfillmentInfoClient.setFulFillmentInfo(
              { orderId: order.id, version: order.version },
              { body: {} }
            ).then(function (result) {
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
  return paymentHelper.getPaymentConfig(ctx).then(function (config) {
    amazonPay.configure(config);
    return amazonPay
      .getOrderDetails(awsReferenceId, addressConsentToken)
      .then(function (order) {
        return {
          awsOrder:
            order.GetOrderReferenceDetailsResponse
              .GetOrderReferenceDetailsResult.OrderReferenceDetails,
          config: config,
        };
      });
  });
}

/**
 * Get Amazon Pay v2 Checkout Session details
 * @param {Object} ctx - Context
 * @param {string} checkoutSessionId - Checkout session ID
 * @returns {Promise} Checkout session details
 */
function getCheckoutSessionDetails(ctx, checkoutSessionId) {
  return paymentHelper.getPaymentConfig(ctx).then(function (config) {
    console.debug('getCheckoutSessionDetails Retrieved payment config: ', config);
    // Configure v2 SDK
    amazonPayV2.configure({
      publicKeyId: config.publicKeyId,
      privateKey: config.privateKey,
      region: config.region,
      isSandbox: config.isSandbox
    });

    return amazonPayV2.getCheckoutSession(checkoutSessionId).then(function (session) {
      console.debug('Checkout session retrieved:', session);
      return {
        checkoutSession: session,
        config: config
      };
    });
  });
}

function getFulfillmentInfo(awsOrder, data, context) {
  var orderDetails =
    awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult
      .OrderReferenceDetails;
  var destinationPath = orderDetails.Destination.PhysicalDestination;
  try {
    console.log(destinationPath);

    var name = destinationPath.Name;
    var nameSplit = name.split(/\s/);
    var firstName = nameSplit[0];
    var lastName = context.configuration.missingLastNameValue;
    if (nameSplit[1]) lastName = nameSplit[1];
    var registeredUser = helper.getUserEmail(context);

    var phone = destinationPath.Phone;
    var contact = {
      fulfillmentContact: {
        email: registeredUser || orderDetails.Buyer.Email,
        phoneNumbers: {
          home: phone ? phone : "N/A",
        },
        address: {
          address1: destinationPath.AddressLine1,
          address2: destinationPath.AddressLine2,
          cityOrTown: destinationPath.City,
          stateOrProvince: destinationPath.StateOrRegion,
          postalOrZipCode: destinationPath.PostalCode,
          countryCode: destinationPath.CountryCode,
          addressType: "Residential",
          isValidated: "true",
        },
      },
      data: data,
    };

    contact.fulfillmentContact.firstName = firstName;
    contact.fulfillmentContact.lastNameOrSurname = lastName;
    return contact;
  } catch (e) {
    console.log(e);
    new Error(e);
  }
}

/**
 * Get fulfillment info from Amazon Pay v2 Checkout Session
 * @param {Object} checkoutSession - Checkout session object
 * @param {Object} data - Additional data to include
 * @param {Object} context - Request context
 * @returns {Object} Fulfillment contact info
 */
function getFulfillmentInfoFromSession(checkoutSession, data, context) {
  try {
    var shippingAddress = checkoutSession.shippingAddress;
    var buyer = checkoutSession.buyer;

    if (!shippingAddress) {
      throw new Error('No shipping address in checkout session');
    }

    var name = shippingAddress.name || '';
    var nameSplit = name.split(/\s/);
    var firstName = nameSplit[0] || '';
    var lastName = context.configuration.missingLastNameValue || 'N/A';
    if (nameSplit[1]) {
      lastName = nameSplit.slice(1).join(' ');
    }

    var registeredUser = helper.getUserEmail(context);
    var phone = shippingAddress.phoneNumber || 'N/A';

    var contact = {
      fulfillmentContact: {
        email: registeredUser || (buyer ? buyer.email : ''),
        firstName: firstName,
        lastNameOrSurname: lastName,
        phoneNumbers: {
          home: phone,
        },
        address: {
          address1: shippingAddress.addressLine1 || '',
          address2: shippingAddress.addressLine2 || '',
          address3: shippingAddress.addressLine3 || '',
          cityOrTown: shippingAddress.city || '',
          stateOrProvince: shippingAddress.stateOrRegion || '',
          postalOrZipCode: shippingAddress.postalCode || '',
          countryCode: shippingAddress.countryCode || '',
          addressType: "Residential",
          isValidated: "true",
        },
      },
      data: data,
    };

    console.log('Fulfillment info from session:', contact);
    return contact;
  } catch (e) {
    console.error('Error parsing fulfillment info from session:', e);
    throw new Error(e);
  }
}

function getOrder(context) {
  if (context.get.isForCheckout()) return context.get.checkout();
  else return context.get.order();
}

module.exports = function (context, callback) {
  var self = this;
  self.ctx = context;
  self.cb = callback;

  self.validateUserSession = function () {
    var user = self.ctx.items.pageContext.user;
    if (!user.isAnonymous && !user.IsAuthenticated) {
      self.ctx.response.redirect(
        "/user/login?returnUrl=" + encodeURIComponent(self.ctx.request.url)
      );
      return self.ctx.response.end();
    }
  };

  // Validate if the checkout process is for amazon process.
  // Convert cart to order
  // redirect to checkout page
  self.validateAndProcess = function () {
    var params = helper.parseUrlParams(self.ctx);

    if (
      !helper.isAmazonCheckout(self.ctx) ||
      (!helper.isCartPage(self.ctx) && params.view == "amazon-checkout")
    ) {
      console.log(
        "not amazon checkout or is requesting amazon-checkout view, ending request."
      );
      return self.cb();
    }
    console.log("ApiContext", self.ctx.apiContext);
    var isMultishipEnabled = false;

    //* Only for requests from cart page. Requests from checkout page are terminated above.
    return paymentHelper
      .getPaymentConfig(self.ctx)
      .then(function (config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(params.access_token);
      })
      .then(function (isTokenValid) {
        console.log("Is Amazon token valid", isTokenValid);
        var cartId = params.cartId;
        if (isTokenValid && cartId) {
          //validate user claims
          helper.validateUserSession(self.ctx);
          return getCheckoutSettings(self.ctx).then(function (siteSettings) {
            if (!siteSettings.isMultishipEnabled) {
              console.log("Converting cart to order", cartId);
              return createOrderFromCart(self.ctx.apiContext.userId, cartId);
            } else {
              console.log("Converting cart to checkout", cartId);
              isMultishipEnabled = true;
              return createCheckoutFromCart(self.ctx.apiContext.userId, cartId);
            }
          });
        } else if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect("/cart");
          return self.ctx.response.end();
        }
        return self.cb();
      })
      .then(function (order) {
        console.log("Order created from cart", order.id);
        delete params.cartId;
        var queryString = "";
        Object.keys(params).forEach(function (key) {
          if (queryString !== "") queryString += "&";
          queryString += key + "=" + params[key];
        });

        if (isMultishipEnabled)
          self.ctx.response.redirect(
            "/checkoutV2/" + order.id + "?" + queryString
          );
        else {
          console.log("Redirecting to checkout:", order.id);
          self.ctx.response.redirect(
            "/checkout/" + order.id + "?" + queryString
          );
        }
        self.ctx.response.end();
      })
      .catch(function (e) {
        console.error(e);
        context.cache.request.set("amazonError", e);
        return self.cb();
      }); //.then(self.cb, self.cb);
  };

  //Add view data to control theme flow
  //Check if token expired before getting fulfillment info. if token expired redirect to cart page for re-authentication
  self.addViewData = function () {
    var params = helper.parseUrlParams(self.ctx);

    if (!helper.isAmazonCheckout(self.ctx)) return self.cb();

    paymentHelper
      .getPaymentConfig(self.ctx)
      .then(function (config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(params.access_token);
      })
      .then(function (isTokenValid) {
        console.log("is token valid", isTokenValid);
        if (!isTokenValid) {
          console.log("Amazon token and expried, redirecting to cart");
          self.ctx.response.redirect("/cart");
          self.ctx.response.end();
        } else if (_.has(params, "view")) {
          console.log("Changing view name to amazon-checkout");
          self.ctx.response.viewName = params.view;
          console.log("context response viewName", self.ctx.response.viewName);
        } else self.ctx.response.viewData.awsCheckout = true;
        return self.cb();
      })
      .catch(function (err) {
        console.error(err);
        return self.cb(err);
      });
  };

  // Get full shipping information from amazon. need a valid token to get full shipping details from amazon
  // Aws Referenceid and token is passed in fulfillmentInfo.data object
  // update request params with new fulfillmentinfo
  self.addFulfillmentInfo = function () {
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
    console.log(
      "Reading payment settings for " + paymentConstants.PAYMENTSETTINGID
    );

    paymentHelper
      .getPaymentConfig(self.ctx)
      .then(function (config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(addressConsentToken);
      })
      .then(function (isTokenValid) {
        console.log("isTokenValid", isTokenValid);
        if (isTokenValid) {
          console.log(
            "Pay by Amazon token is valid...setting fulfilmment info"
          );
          return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken);
        } else {
          console.error(
            "Amazon session expired. Please re-login from cart page to continue checkout"
          );
          throw new Error(
            "Amazon session expired. Please re-login from cart page to continue checkout"
          );
        }
      })
      .then(function (awsOrder) {
        var shippingAddress = getFulfillmentInfo(awsOrder, data, self.ctx);
        if (fulfillmentInfo.fulfillmentContact)
          shippingAddress.fulfillmentContact.email =
            fulfillmentInfo.fulfillmentContact.email || shippingAddress.email;

        self.ctx.request.params.fulfillmentInfo = shippingAddress;

        console.log(
          "fulfillmentInfo from AWS",
          self.ctx.request.params.fulfillmentInfo
        );
        self.cb();
      })
      .catch(function (err) {
        console.error(err);
        self.cb(err);
      });
  };

  self.addDestination = function () {
    console.log(self.ctx.request.params);

    var destination = self.ctx.request.params.destination;
    console.log(destination);
    var id = destination.id;

    var data = destination.data;
    if (!data) return self.cb();

    var awsReferenceId = data.awsReferenceId;
    var addressConsentToken = data.addressAuthorizationToken;

    if (!awsReferenceId && !addressConsentToken) {
      console.log("not an amazon order...");
      return self.cb();
    }
    console.log(
      "Reading payment settings for " + paymentConstants.PAYMENTSETTINGID
    );

    paymentHelper
      .getPaymentConfig(self.ctx)
      .then(function (config) {
        if (!config.isEnabled) return self.cb();
        amazonPay.configure(config);
        return amazonPay.validateToken(addressConsentToken);
      })
      .then(function (isTokenValid) {
        console.log("isTokenValid", isTokenValid);
        if (isTokenValid) {
          console.log(
            "Pay by Amazon token is valid...setting fulfilmment info"
          );
          return amazonPay.getOrderDetails(awsReferenceId, addressConsentToken);
        } else {
          console.error(
            "Amazon session expired. Please re-login from cart page to continue checkout"
          );
          throw new Error(
            "Amazon session expired. Please re-login from cart page to continue checkout"
          );
        }
      })
      .then(function (awsOrder) {
        var fulfillmentInfo = getFulfillmentInfo(awsOrder, data, self.ctx);
        var destination = {
          destinationContact: fulfillmentInfo.fulfillmentContact,
          data: fulfillmentInfo.data,
        };

        if (destination.destinationContact)
          destination.destinationContact.email =
            destination.destinationContact.email || destination.email;

        if (id) destination.id = id;

        console.log(destination);

        self.ctx.request.params.destination = destination;
        self.cb();
      })
      .catch(function (err) {
        console.error(err);
        self.cb(err);
      });
  };

  self.getBillingInfo = function (awsReferenceId, billingContact) {
    //var awsReferenceId = awsData.awsReferenceId;
    return getAmazonOrderDetails(self.ctx, awsReferenceId, null)
      .then(function (data) {
        var order = getOrder(self.ctx);
        console.log(order);
        if (order.destinations) {
          var awsDestination = _.find(
            order.destinations,
            function (destination) {
              return (
                destination.data &&
                destination.data.awsReferenceId == awsReferenceId
              );
            }
          );
          console.log(awsDestination);
          if (awsDestination)
            billingContact.email = awsDestination.destinationContact.email;
        }

        if (!data.config.billingType || data.config.billingType === "0")
          return billingContact;

        var orderDetails = data.awsOrder;
        if (
          orderDetails.BillingAddress &&
          orderDetails.BillingAddress.PhysicalAddress
        ) {
          var address = orderDetails.BillingAddress.PhysicalAddress;
          console.log("Amazon order", orderDetails);
          var parts = address.Name.split(/\s/);
          var firstName = parts[0];
          var lastName = address.Name.replace(parts[0] + " ", "").replace(
            parts[0],
            ""
          );
          billingContact.firstName = firstName;
          billingContact.lastNameOrSurname = lastName;
          billingContact.phoneNumbers = {
            home: address.Phone ? address.phone : "N/A",
          };
          billingContact.address = {
            address1: address.AddressLine1,
            cityOrTown: address.City,
            stateOrProvince: address.StateOrRegion,
            postalOrZipCode: address.PostalCode,
            countryCode: address.CountryCode,
            addressType: "Residential",
            isValidated: true,
          };
        }
        console.log("billing contact", billingContact);
        return billingContact;
      })
      .catch(function (err) {
        console.error(err);
        return billingContact;
      });
  };

  /**
   * Get billing info from Amazon Pay v2 checkout session
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {Object} billingContact - Base billing contact info
   * @returns {Promise<Object>} Updated billing contact
   */
  self.getBillingInfoFromSession = function (checkoutSessionId, billingContact) {
    console.log("Getting billing info from checkout session:", checkoutSessionId);

    return getCheckoutSessionDetails(self.ctx, checkoutSessionId)
      .then(function (data) {
        var session = data.checkoutSession;
        var order = getOrder(self.ctx);

        console.log("Checkout session details:", session);

        // Get email from order destinations if available
        if (order.destinations) {
          var awsDestination = _.find(
            order.destinations,
            function (destination) {
              return (
                destination.data &&
                destination.data.checkoutSessionId == checkoutSessionId
              );
            }
          );
          if (awsDestination && awsDestination.destinationContact) {
            billingContact.email = awsDestination.destinationContact.email;
          }
        }

        // If no email yet, use buyer email from session
        if (!billingContact.email && session.buyer && session.buyer.email) {
          billingContact.email = session.buyer.email;
        }

        // Check if we should use billing address (based on config)
        if (!data.config.billingType || data.config.billingType === "0") {
          console.log("Using default billing contact");
          return billingContact;
        }

        // Extract billing address from checkout session
        var billingAddress = session.billingAddress;
        if (billingAddress) {
          console.log("Using billing address from checkout session");

          var name = billingAddress.name || '';
          var parts = name.split(/\s/);
          var firstName = parts[0] || '';
          var lastName = parts.slice(1).join(' ') || '';

          billingContact.firstName = firstName;
          billingContact.lastNameOrSurname = lastName;
          billingContact.phoneNumbers = {
            home: billingAddress.phoneNumber || "N/A",
          };
          billingContact.address = {
            address1: billingAddress.addressLine1 || '',
            address2: billingAddress.addressLine2 || '',
            address3: billingAddress.addressLine3 || '',
            cityOrTown: billingAddress.city || '',
            stateOrProvince: billingAddress.stateOrRegion || '',
            postalOrZipCode: billingAddress.postalCode || '',
            countryCode: billingAddress.countryCode || '',
            addressType: "Residential",
            isValidated: true,
          };
        }

        console.log("billing contact from session:", billingContact);
        return billingContact;
      })
      .catch(function (err) {
        console.error("Error getting billing info from session:", err);
        return billingContact;
      });
  };

  self.getOrder = function () {
    return getOrder(self.ctx);
  };

  self.validateAmazonOrder = function (awsReferenceId) {
    return getAmazonOrderDetails(self.ctx, awsReferenceId, null)
      .then(function (data) {
        var orderDetails = data.awsOrder;
        console.log("Order status", orderDetails.OrderReferenceStatus);
        var state = orderDetails.OrderReferenceStatus.State;
        if (state === "Canceled") {
          console.log(
            "Order status",
            "Amazon order " + awsReferenceId + " went into stale state"
          );
          self.cb(
            "Amazon order has timed out. Relogin from cart or checkout page"
          );
        }

        //check constraints
        if (orderDetails.Constraints) {
          var paymentNotSet = _.find(orderDetails.Constraint, function (c) {
            return c.ConstraintID === "PaymentPlanNotSet";
          });
          if (paymentNotSet) {
            console.log(
              "Amazon payment not set",
              "Amazon order " + awsReferenceId + " payment not set"
            );
            self.cb(
              "A valid payment has not been selected from Amazon. Please fix the issue before placing the order"
            );
          }
        }
      })
      .catch(function (err) {
        console.error("Error validating aws order", err);
        self.cb(err);
      });
  };

  //Process payment interactions
  self.processPayment = function () {
    var paymentAction = self.ctx.get.paymentAction();
    var payment = self.ctx.get.payment();

    console.log("Payment Action:", paymentAction.actionName);
    //console.log("Payment", payment);
    console.log("apiContext", self.ctx.apiContext);
    if (payment.paymentType !== paymentConstants.PAYMENTSETTINGID)
      return self.cb();

    if (!payment.externalTransactionId)
      payment.externalTransactionId = payment.billingInfo.externalTransactionId;
    if (!payment.externalTransactionId)
      throw new Error("PayWith Amazon Referenceid is missing");

    if (self.ctx.configuration && self.ctx.configuration.payment)
      declineCapture = self.ctx.configuration.payment.declineCapture === true;

    try {
      paymentHelper
        .getPaymentConfig(self.ctx)
        .then(function (config) {
          // Detect if this is Amazon Pay v2 (checkout session) or v1 (order reference)
          var isV2 = paymentHelper.isCheckoutSession(payment);
          console.log("Amazon Pay version:", isV2 ? "v2 (Checkout Session)" : "v1 (Order Reference)");

          switch (paymentAction.actionName) {
            case "CreatePayment":
              console.log(
                "adding new payment interaction for ",
                paymentAction.externalTransactionId
              );
              // v2 doesn't need createNewPayment - session already created by frontend
              if (isV2) {
                return {
                  status: paymentConstants.NEW,
                  amount: paymentAction.amount
                };
              }
              return paymentHelper.createNewPayment(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            case "VoidPayment":
              console.log(
                "Voiding payment interaction for ",
                payment.externalTransactionId
              );
              console.log("Void Payment", payment.id);
              if (isV2) {
                return paymentHelper.voidPaymentV2(
                  self.ctx,
                  config,
                  paymentAction,
                  payment
                );
              }
              return paymentHelper.voidPayment(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            case "AuthorizePayment":
              console.log(
                "Authorizing payment for ",
                payment.externalTransactionId
              );
              if (isV2) {
                return paymentHelper.confirmAndAuthorizeV2(
                  self.ctx,
                  config,
                  paymentAction,
                  payment
                );
              }
              return paymentHelper.confirmAndAuthorize(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            case "CapturePayment":
              console.log(
                "Capture payment for ",
                payment.externalTransactionId
              );
              if (isV2) {
                return paymentHelper.captureAmountV2(
                  self.ctx,
                  config,
                  paymentAction,
                  payment
                );
              }
              return paymentHelper.captureAmount(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            case "CreditPayment":
              console.log(
                "Crediting payment for ",
                payment.externalTransactionId
              );
              if (isV2) {
                return paymentHelper.creditPaymentV2(
                  self.ctx,
                  config,
                  paymentAction,
                  payment
                );
              }
              return paymentHelper.creditPayment(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            case "DeclinePayment":
              console.log(
                "Decline payment for ",
                payment.externalTransactionId
              );
              // Decline uses same logic as void
              if (isV2) {
                return paymentHelper.voidPaymentV2(
                  self.ctx,
                  config,
                  paymentAction,
                  payment
                );
              }
              return paymentHelper.declinePayment(
                self.ctx,
                config,
                paymentAction,
                payment
              );
            default:
              return {
                status: paymentConstants.FAILED,
                responseText: "Not implemented",
                responseCode: "NOTIMPLEMENTED",
              };
          }
        })
        .then(function (paymentResult) {
          console.log(paymentResult);
          paymentHelper.processPaymentResult(
            self.ctx,
            paymentResult,
            paymentAction,
            payment
          );
          self.cb();
        })
        .catch(function (err) {
          console.error(err);
          var errorInteraction = {
            status: paymentConstants.FAILED,
            gatewayResponseText: err,
          };
          payment.interactions.push(errorInteraction);
          self.ctx.exec.addPaymentInteraction(errorInteraction);
          self.cb(err);
        })
        .catch(function (err) {
          console.error(err);
          self.cb(err);
        });
    } catch (e) {
      console.error(e);
      self.cb(e);
    }
  };

  //Close the order in amazon once the order has been marked as completed in mozu
  self.closeOrder = function () {
    var mzOrder = self.ctx.get.order();
    if (mzOrder.status != "Completed") return self.cb();
    console.log("Order", mzOrder);
    //validate it is amazon payment
    var payment = _.find(mzOrder.payments, function (payment) {
      return (
        payment.paymentType == paymentConstants.PAYMENTSETTINGID &&
        payment.status == "Collected"
      );
    });
    console.log("Amazon payment payment", payment);

    if (!payment) return self.cb();
    paymentHelper
      .getPaymentConfig(self.ctx)
      .then(function (config) {
        amazonPay.configure(config);
        return amazonPay.getOrderDetails(payment.externalTransactionId);
      })
      .then(function (awsOrder) {
        var state =
          awsOrder.GetOrderReferenceDetailsResponse
            .GetOrderReferenceDetailsResult.OrderReferenceDetails
            .OrderReferenceStatus.State;
        console.log("Aws Order status", state);
        if (state != "Open") return;

        return amazonPay.closeOrder(payment.externalTransactionId).then(
          function (closeResult) {
            console.log("Close AWS Oder result", closeResult);
          },
          function (err) {
            console.log("Close Aws order error", err);
          }
        );
      })
      .then(self.cb, self.cb);
  };

  self.setError = function (error) {
    console.log(err);
    self.ctx.cache.request.set("amazonError", err);
    self.cb();
  };
};
