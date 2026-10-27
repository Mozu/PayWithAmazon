var PaymentSettings = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings");
var helper = require("./helper");
var _ = require("underscore");
var paymentConstants = require("./constants");
const constants = require("./constants");
var amazonPay = require("./amazonpaysdk")();
var amazonPayV2 = require("./v2/sdk")();
var crypto = require("crypto");

var paymentHelper = (module.exports = {
  getPaymentConfig: function (context) {
    var self = this;
    var fqn = helper.getPaymentFQN(context);
    return helper
      .createClientFromContext(PaymentSettings, context, true)
      //TODO need to generate new mozu-node-sdk to have access to new API. Using old plaintext version for now
      //     But the node-sdk requires public API and I wanted this to be private.
      //     Should I implement call to internal endpoint, make the privateValues API public, or rethink this approach?
      //.getThirdPartyPaymentWorkflowWithPrivateValues({ fullyQualifiedName: fqn })
      .getThirdPartyPaymentWorkflowWithValues({ fullyQualifiedName: fqn })
      .then(function (paymentSettings) {
        return self.getConfig(context, paymentSettings);
      });
  },
  getConfig: function (context, paymentSettings) {
    var orderProcessing = helper.getValue(
      paymentSettings,
      paymentConstants.ORDERPROCESSING
    );

    var captureOnAuthorize =
      orderProcessing == paymentConstants.CAPTUREONSUBMIT;

    var environment = helper.getValue(
      paymentSettings,
      paymentConstants.ENVIRONMENT
    );

    // Build configuration supporting both v1 (MWS) and v2 (API v2)
    var rawRegion = helper.getValue(paymentSettings, paymentConstants.REGION);

    // Map v1 region codes to v2 region codes for Amazon Pay API v2
    var regionMapping = {
      'us': 'NA',  // US maps to North America for v2
      'uk': 'EU',  // UK maps to Europe for v2
      'de': 'EU',  // Germany maps to Europe for v2
      'jp': 'JP'   // Japan stays the same
    };

    var config = {
      isSandbox: environment === "sandbox",
      environment: environment,
      region: regionMapping[rawRegion] || rawRegion, // Use mapping or fallback to raw value
      v1Region: rawRegion, // Raw region key for legacy v1 MWS endpoint lookups
      captureOnAuthorize: captureOnAuthorize,
      isEnabled: paymentSettings.isEnabled || paymentSettings.IsEnabled,
      billingType: helper.getValue(
        paymentSettings,
        paymentConstants.BILLINGADDRESS
      ),

      // Amazon Pay API v2 credentials
      publicKeyId: helper.getValue(paymentSettings, "publicKeyId"),
      privateKey: helper.getValue(paymentSettings, "privateKey"),
      storeId: helper.getValue(paymentSettings, "storeId"),
      merchantId: helper.getValue(paymentSettings, "merchantId"),

      // Amazon Pay v1 (MWS) credentials
      sellerId: helper.getValue(paymentSettings, paymentConstants.SELLERID),
      mwsAccessKeyId: helper.getValue(
        paymentSettings,
        paymentConstants.AWSACCESSKEYID
      ),
      mwsSecret: helper.getValue(paymentSettings, paymentConstants.AWSSECRET),
      mwsAuthToken: helper.getValue(paymentSettings, paymentConstants.AUTHTOKEN),
    };
    return Promise.resolve(config);
  },
  validatePaymentSettings: function (context, callback) {
    var self = this;
    var paymentSettings = context.request.body || {};

    var pwaSettings = _.findWhere(
      paymentSettings.externalPaymentWorkflowDefinitions,
      { fullyQualifiedName: helper.getPaymentFQN(context) }
    );

    if (!pwaSettings || !(pwaSettings.isEnabled || pwaSettings.IsEnabled)) {
      callback();
      return;
    }

    self.getConfig(context, pwaSettings).then(
      function (config) {
        if (!config.publicKeyId || !config.privateKey) {
          callback("Pay With Amazon - AWS PublicKey/PrivateKey not found.");
          return;
        }

        if (
          !config.publicKeyId ||
          !config.privateKey ||
          !config.storeId ||
          !config.region ||
          !config.merchantId ||
          !config.environment
        ) {
          callback(
            "Pay With Amazon - Environment/PublicKey/PrivateKey/StoreId/Region/MerchantId fields are required."
          );
          return;
        }

        callback();
      },
      function (err) {
        console.error("Error validating payment settings", err);
        callback("Pay With Amazon - Error reading payment settings.");
      }
    );
  },
  getInteractionByStatus: function (interactions, status) {
    return _.find(interactions, function (interaction) {
      return interaction.status == status;
    });
  },
  processPaymentResult: function (
    context,
    paymentResult,
    paymentAction,  
    payment
  ) {
    var interactionType = "";
    var isManual = false;

    if (paymentAction.manualGatewayInteraction) isManual = true;

    switch (paymentAction.actionName) {
      case "VoidPayment":
        interactionType = "Void";
        break;
      case "CreatePayment":
      case "AuthorizePayment":
        interactionType = "Authorization";
        break;
      case "CapturePayment":
        interactionType = "Capture";
        break;
      case "CreditPayment":
        interactionType = "Credit";
        break;
      case "DeclinePayment":
        interactionType = "Decline";
        break;
      case "RollbackPayment":
        interactionType = "Rollback";
        break;
      default:
        interactionType = "";
        break;
    }

    if (paymentResult.status == paymentConstants.NEW)
      context.exec.setPaymentAmountRequested(paymentAction.amount);

    if (
      paymentResult.status == paymentConstants.CREDITPENDING ||
      paymentResult.status == paymentConstants.CREDITED
    )
      context.exec.setPaymentAmountCredited(paymentResult.amount);

    var interaction = {
      status: paymentResult.status,
      interactionType: interactionType,
    };
    if (paymentResult.amount) interaction.amount = paymentResult.amount;

    if (paymentResult.awsTransactionId)
      interaction.gatewayTransactionId = paymentResult.awsTransactionId;

    if (paymentResult.responseText)
      interaction.gatewayResponseText = paymentResult.responseText;

    if (paymentResult.responseCode)
      interaction.gatewayResponseCode = paymentResult.responseCode;

    interaction.isManual = isManual;
    console.log("Payment Action result", interaction);
    if (payment.interactions) payment.interactions.push(interaction);
    context.exec.addPaymentInteraction(interaction);

    if (paymentResult.captureOnAuthorize) {
      var captureInteraction = {
        status: paymentConstants.CAPTURED,
        interactionType: "Capture"
      };
      captureInteraction.gatewayTransactionId = paymentResult.captureId;
      captureInteraction.amount = paymentResult.amount;
      captureInteraction.awsTransactionId = paymentResult.awsTransactionId;
      captureInteraction.gatewayResponseText = paymentResult.responseText;
      captureInteraction.gatewayResponseCode = paymentResult.responseCode;
      console.log("Capture Payment Interaction", captureInteraction);
      if (payment.interactions) payment.interactions.push(captureInteraction);
      context.exec.addPaymentInteraction(captureInteraction);
    }

    if (paymentResult.status == paymentConstants.CAPTURED)
      context.exec.setPaymentAmountCollected(paymentResult.amount);
  },
  createNewPayment: function (context, config, paymentAction, payment) {
    var newStatus = {
      status: paymentConstants.NEW,
      amount: paymentAction.amount,
    };
    console.log(newStatus);
    if (paymentAction.amount === 0) return Promise.resolve(newStatus);

    amazonPay.configure(config);
    console.log("config done");
    try {
      return helper
        .getOrderDetails(context)
        .then(function (orderDetails) {
          orderDetails.amount = paymentAction.amount;
          orderDetails.currencyCode = paymentAction.currencyCode;
          console.log("Order Details", orderDetails);
          return orderDetails;
        })
        .then(function (orderDetails) {
          var existingPayment = _.find(
            orderDetails.payments,
            function (payment) {
              return (
                payment.paymentType === paymentConstants.PAYMENTSETTINGID &&
                payment.paymentWorkflow === paymentConstants.PAYMENTSETTINGID &&
                payment.status === "Collected"
              );
            }
          );

          if (existingPayment) return newStatus;

          return amazonPay
            .setOrderDetails(paymentAction.externalTransactionId, orderDetails)
            .then(
              function (result) {
                return newStatus;
              },
              function (err) {
                console.log("Amazon Create new payment Error", err);
                return {
                  status: paymentConstants.FAILED,
                  responseText: err.message,
                  responseCode: err.code,
                };
              }
            );
        })
        .catch(function (err) {
          console.log(err);
          return { status: paymentConstants.FAILED, responseText: err };
        });
    } catch (e) {
      console.error(e);
      return Promise.resolve({
        status: paymentConstants.FAILED,
        responseText: e,
      });
    }
  },
  authorizePayment: function (context, config, paymentAction, payment) {
    try {
      var declineAuth = false;
      if (context.configuration && context.configuration.payment)
        declineAuth = context.configuration.payment.declineAuth === true;

      return amazonPay
        .confirmOrder(payment.externalTransactionId)
        .then(function () {
          return amazonPay
            .requestAuthorzation(
              payment.externalTransactionId,
              payment.amountRequested,
              paymentAction.currencyCode,
              payment.id,
              config.captureOnAuthorize,
              declineAuth
            )
            .then(
              function (authResult) {
                var authDetails =
                  authResult.AuthorizeResponse.AuthorizeResult
                    .AuthorizationDetails;
                console.log("Authorize result", authDetails);
                var state = authDetails.AuthorizationStatus.State;
                var status = paymentConstants.DECLINED;
                var awsTransactionId = authDetails.AmazonAuthorizationId;
                var captureId = null;
                if (state == "Open" || state == "Closed")
                  status = paymentConstants.AUTHORIZED;
                if (config.captureOnAuthorize) {
                  captureId = authDetails.IdList.member;
                }

                var response = {
                  awsTransactionId: awsTransactionId,
                  captureId: captureId,
                  responseCode: 200,
                  responseText: state,
                  status: status,
                  amount: payment.amountRequested,
                  captureOnAuthorize: config.captureOnAuthorize,
                };
                console.log("Repsonse", response);
                return response;
              },
              function (err) {
                console.error(err);
                return {
                  status: paymentConstants.DECLINED,
                  responseCode: err.code,
                  responseText: err.message,
                };
              }
            );
        })
        .catch(function (err) {
          console.error("err", err);
          return {
            status: paymentConstants.DECLINED,
            responseText: err.message,
          };
        });
    } catch (e) {
      console.error("exception", e);
      return { status: paymentConstants.DECLINED, responseText: e };
    }
  },
  confirmAndAuthorize: function (context, config, paymentAction, payment) {
    var self = this;
    try {
      amazonPay.configure(config);
      return this.createNewPayment(context, config, paymentAction, payment)
        .then(
          function (result) {
            if (result.status == paymentConstants.FAILED) {
              result.status = paymentConstants.DECLINED;
              return result;
            }
            return self.authorizePayment(
              context,
              config,
              paymentAction,
              payment
            );
          },
          function (err) {
            console.log("Amazon confirm order failed", err);
            return {
              status: paymentConstants.DECLINED,
              responseCode: err.code,
              responseText: err.message,
            };
          }
        )
        .catch(function (err) {
          console.log(err);
          return { status: paymentConstants.DECLINED, responseText: err };
        });
    } catch (e) {
      console.error(e);
      return { status: paymentConstants.DECLINED, responseText: e };
    }
  },
  captureAmount: function (context, config, paymentAction, payment) {
    var self = this;
    amazonPay.configure(config);
    var declineCapture = false;
    var pendingCapture = false;
    console.log("Configuration:", context.configuration);
    if (context.configuration && context.configuration.payment) {
      declineCapture = context.configuration.payment.declineCapture === true;
      pendingCapture = context.configuration.payment.pendingCapture === true;
    }

    return helper
      .getOrderDetails(context)
      .then(function (orderDetails) {
        orderDetails.requestedAmount = payment.requestedAmount;
        orderDetails.captureAmount = paymentAction.amount;
        orderDetails.currencyCode = paymentAction.currencyCode;

        console.log("Order details", orderDetails);

        if (paymentAction.manualGatewayInteraction) {
          console.log("Manual capture...dont send to amazon");
          return {
            amount: paymentAction.amount,
            gatewayResponseCode: "OK",
            status: paymentConstants.CAPTURED,
            awsTransactionId:
              paymentAction.manualGatewayInteraction.gatewayInteractionId,
          };
        }

        var interactions = payment.interactions;

        var paymentAuthorizationInteraction = self.getInteractionByStatus(
          interactions,
          paymentConstants.AUTHORIZED
        );

        console.log("Authorized interaction", paymentAuthorizationInteraction);
        if (!paymentAuthorizationInteraction) {
          console.log("no authorized interaction found");
          //console.log("interactions", interactions);
          return {
            status: paymentConstants.FAILED,
            responseText:
              "Amazon Authorization Id not found in payment interactions",
            responseCode: 500,
          };
        }

        var capturedInteractionWithPendingState = _.findWhere(interactions, { status: "Failed", gatewayResponseText: "Pending" });
        if (capturedInteractionWithPendingState) {
          console.log("Found capture interaction with pending status");
          var amazonCaptureId = capturedInteractionWithPendingState.gatewayTransactionId;
          return amazonPay
            .getCaptureDetails(amazonCaptureId)
            .then(function (captureResponse) {
              var captureDetails = captureResponse.GetCaptureDetailsResponse.GetCaptureDetailsResult.CaptureDetails;
              //console.log("AWS Capture Details", JSON.stringify(captureDetails));
              var state = captureDetails.CaptureStatus.State;
              var status;
              switch (state) {
                case "Completed":
                  status = paymentConstants.CAPTURED;
                  break;
                case "Declined":
                  status = paymentConstants.DECLINED;
                  break;
                default:
                  status = paymentConstants.FAILED;
                  break;
              }
              var response = {
                status: status,
                awsTransactionId: captureDetails.AmazonCaptureId,
                responseText: "Capture Status: " + state,
                responseCode: 200,
                amount: captureDetails.CaptureAmount.Amount,
              };
              return response;
            })
            .catch(function (err) {
              console.error("Get Capture Detials Error", err);
              return {
                status: paymentConstants.FAILED,
                responseText: err.message,
                responseCode: err.code,
              };
            });
        }


        return amazonPay
          .captureAmount(
            paymentAuthorizationInteraction.gatewayTransactionId,
            orderDetails,
            helper.getUniqueId(),
            declineCapture,
            pendingCapture
          )
          .then(
            function (captureResult) {
              console.log("AWS Capture Result", captureResult);
              var captureDetails =
                captureResult.CaptureResponse.CaptureResult.CaptureDetails;
              var state = captureDetails.CaptureStatus.State;
              var captureId = captureDetails.AmazonCaptureId;

              var response = {
                status:
                  state == "Completed" ? paymentConstants.CAPTURED : paymentConstants.FAILED,
                awsTransactionId: captureId,
                responseText: state,
                responseCode: 200,
                amount: orderDetails.captureAmount,
              };

              return response;
            },
            function (err) {
              console.error("Capture Error", err);
              return {
                status: paymentConstants.FAILED,
                responseText: err.message,
                responseCode: err.code,
              };
            }
          );
      })
      .catch(function (err) {
        console.error(err);
        return { status: paymentConstants.FAILED, responseText: err };
      });
  },
  creditPayment: function (context, config, paymentAction, payment) {
    var self = this;
    amazonPay.configure(config);
    return helper
      .getOrderDetails(context)
      .then(function (orderDetails) {
        var capturedInteraction = self.getInteractionByStatus(
          payment.interactions,
          paymentConstants.CAPTURED
        );
        console.log(
          "AWS Refund, previous capturedInteraction",
          capturedInteraction
        );
        if (!capturedInteraction) {
          return {
            status: paymentConstants.FAILED,
            responseCode: "InvalidRequest",
            responseText: "Payment has not been captured to issue refund",
          };
        }

        if (paymentAction.manualGatewayInteraction) {
          console.log("Manual credit...dont send to amazon");
          return {
            amount: paymentAction.amount,
            gatewayResponseCode: "OK",
            status: paymentConstants.CREDITED,
            awsTransactionId:
              paymentAction.manualGatewayInteraction.gatewayInteractionId,
          };
        }

        orderDetails.amount = paymentAction.amount;
        orderDetails.currencyCode = paymentAction.currencyCode;
        orderDetails.note = paymentAction.reason;
        orderDetails.id = helper.getUniqueId();

        console.log("Refund details", orderDetails);
        return amazonPay
          .refund(capturedInteraction.gatewayTransactionId, orderDetails)
          .then(
            function (refundResult) {
              var refundDetails =
                refundResult.RefundResponse.RefundResult.RefundDetails;
              console.log("AWS Refund result", refundDetails);
              var state = refundDetails.RefundStatus.State;
              var refundId = refundDetails.AmazonRefundId;

              var response = {
                status:
                  state == "Pending" ? paymentConstants.CREDITPENDING
                    : state == "Completed" ? paymentConstants.CREDITED : paymentConstants.FAILED,
                awsTransactionId: refundId,
                responseText: state,
                responseCode: 200,
                amount: paymentAction.amount,
              };
              console.log("Refund response", response);
              return response;
            },
            function (err) {
              console.error("Capture Error", err);
              return {
                status: paymentConstants.FAILED,
                responseText: err.message,
                responseCode: err.code,
              };
            }
          );
      })
      .catch(function (err) {
        console.error(err);
        return { status: paymentConstants.FAILED, responseText: err };
      });
  },
  voidPayment: function (context, config, paymentAction, payment) {
    var self = this;
    amazonPay.configure(config);
    //var promise = new Promise(function(resolve, reject) {
    if (paymentAction.manualGatewayInteraction) {
      console.log("Manual void...dont send to amazon");
      var response = {
        amount: paymentAction.amount,
        gatewayResponseCode: "OK",
        status: paymentConstants.VOIDED,
        awsTransactionId:
          paymentAction.manualGatewayInteraction.gatewayInteractionId,
      };
      return Promise.resolve(response);
    }

    var capturedInteraction = self.getInteractionByStatus(
      payment.interactions,
      paymentConstants.CAPTURED
    );
    console.log("Void Payment - Captured interaction", capturedInteraction);
    if (capturedInteraction) {
      var errorResponse = {
        status: paymentConstants.FAILED,
        responseCode: "InvalidRequest",
        responseText:
          "Payment with captures cannot be voided. Please issue a refund",
      };
      return Promise.resolve(errorResponse);
    }

    var authorizedInteraction = self.getInteractionByStatus(
      payment.interactions,
      paymentConstants.AUTHORIZED
    );
    if (!authorizedInteraction || context.get.isVoidActionNoOp())
      return Promise.resolve({
        status: paymentConstants.VOIDED,
        amount: context.get.isVoidActionNoOp() ? 0 : payment.amountRequested,
      });

    return amazonPay
      .cancelOrder(payment.externalTransactionId)
      .then(
        function (result) {
          console.log("Amazon cancel result", result);
          return {
            status: paymentConstants.VOIDED,
            amount: paymentAction.amount,
          };
        },
        function (err) {
          console.error("Amazon cancel failed", err);
          return {
            status: paymentConstants.FAILED,
            responseText: err.message,
            responseCode: err.code,
          };
        }
      )
      .catch(function (err) {
        console.error(err);
        return { status: paymentConstants.FAILED, responseText: err };
      });

    //});
    //return promise;
  },
  declinePayment: function (context, config, paymentAction, payment) {
    var self = this;
    try {
      if (paymentAction.manualGatewayInteraction) {
        console.log("Manual decline...dont send to amazon");
        var response = {
          amount: paymentAction.amount,
          gatewayResponseCode: "OK",
          status: paymentConstants.DECLINED,
          awsTransactionId:
            paymentAction.manualGatewayInteraction.gatewayInteractionId,
        };
        return Promise.resolve(response);
      }
      var capturedInteraction = self.getInteractionByStatus(
        payment.interactions,
        paymentConstants.CAPTURED
      );
      if (capturedInteraction) {
        console.log("Capture found for payment, cannot decline");
        var errorResponse = {
          status: paymentConstants.FAILED,
          responseCode: "InvalidRequest",
          responseText: "Payment with captures cannot be declined",
        };
        return Promise.resolve(errorResponse);
      }

      amazonPay.configure(config);
      return amazonPay.cancelOrder(payment.externalTransactionId).then(
        function (result) {
          console.log(result);
          return { status: paymentConstants.DECLINED };
        },
        function (err) {
          console.error(err);
          return {
            status: paymentConstants.FAILED,
            responseText: err.message,
            responseCode: err.code,
          };
        }
      );
    } catch (e) {
      console.error(e);
      return Promise.resolve({
        status: paymentConstants.FAILED,
        responseText: e.message || e,
      });
    }
  },

  // ========================================
  // Amazon Pay API v2 Methods
  // ========================================

  /**
   * Determine if this is a v2 checkout session or v1 order reference
   */
  isAmazonpayV2: function (payment) {
    // Check if payment type is PayWithAmazonV2 (case-insensitive)
    var paymentType = payment.paymentType || '';
    var isV2 = paymentType.toLowerCase() === constants.PAYMENTSETTINGID.toLocaleLowerCase();

    return isV2;
  },

  /**
   * Detect if this is a legacy v1 (MWS/Order Reference) payment
   */
  isLegacyV1Payment: function (payment) {
    var paymentType = (payment.paymentType || '').toLowerCase();
    return paymentType === 'paywithamazon';
  },

  /**
   * Convert v1 AmazonAuthorizationId to v2-compatible chargeId.
   * Per Amazon migration guide: change 21st character from 'A' to 'C'.
   * Example: S01-1234567-1234567-A012345 → S01-1234567-1234567-C012345
   */
  convertV1AuthIdToChargeId: function (amazonAuthorizationId) {
    console.error("Converting v1 AuthorizationId to v2 ChargeId", amazonAuthorizationId);
    if (!amazonAuthorizationId || amazonAuthorizationId.length < 21) {
      return amazonAuthorizationId;
    }
    // Only convert if character at position 20 is 'A' (authorization marker)
    if (amazonAuthorizationId.charAt(20) === 'A') {
      return amazonAuthorizationId.substring(0, 20) + 'C' + amazonAuthorizationId.substring(21);
    }
    return amazonAuthorizationId;
  },

  /**
   * Complete checkout session and create charge (v2)
   * Replaces confirmAndAuthorize for v2
   */
  confirmAndAuthorizeV2: function (context, config, paymentAction, payment) {
    var self = this;
    var checkoutSessionId = payment.externalTransactionId;

    console.log("Amazon Pay v2: Complete checkout session and create charge", checkoutSessionId);

    try {
      // Configure v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      // TODO: For end-of-checkout placement, may need to update checkout session BEFORE completing it
      // if merchant-collected shipping/billing address needs to be sent to Amazon.
      // Call amazonPayV2.updateCheckoutSession(checkoutSessionId, updatePayload) here if needed.
      // See: https://developer.amazon.com/docs/amazon-pay-checkout/end-of-checkout.html

      // Step 1: Complete the checkout session
      // Note: chargeAmount must match EXACTLY what was sent in updateCheckoutSession
      
      // First, get the session to check its current state
      return amazonPayV2.getCheckoutSession(checkoutSessionId)
        .then(function(currentSession) {
          
          // Check if session already has a charge (preventing duplicate charges)
          if (currentSession.chargeId) {
            console.error("[COMPLETE] Session already has a charge:", currentSession.chargeId);
            // Session already completed with a charge - return existing charge details
            return amazonPayV2.getCharge(currentSession.chargeId)
              .then(function(existingCharge) {
                console.error("[COMPLETE] Using existing charge:", existingCharge);
                
                var chargeState = existingCharge.statusDetails.state;
                var status = paymentConstants.DECLINED;
                
                if (chargeState === 'Authorized' || chargeState === 'AuthorizationInitiated') {
                  status = paymentConstants.AUTHORIZED;
                } else if (chargeState === 'Captured') {
                  status = paymentConstants.CAPTURED;
                }
                
                return {
                  awsTransactionId: existingCharge.chargeId,
                  chargePermissionId: existingCharge.chargePermissionId,
                  responseCode: existingCharge.statusDetails.reasonCode || 200,
                  responseText: existingCharge.statusDetails.reasonDescription || chargeState,
                  status: status,
                  amount: parseFloat(existingCharge.chargeAmount.amount),
                  captureOnAuthorize: false,
                  captureId: chargeState === 'Captured' ? existingCharge.chargeId : null
                };
              });
          }
          
          // NOTE: paymentIntent must be set in updateCheckoutSession, not completeCheckoutSession
          // The completeCheckoutSession only needs chargeAmount to match what was set in updateCheckoutSession
          var completePayload = {
            chargeAmount: {
              amount: paymentAction.amount,
              currencyCode: paymentAction.currencyCode
            }
          };

          console.error("[COMPLETE] Complete payload:", JSON.stringify(completePayload));
          
          return amazonPayV2.completeCheckoutSession(checkoutSessionId, completePayload);
        })
        .then(function (completedSession) {
           // Already-charged retry path returns a payment response object, not a session
           if (completedSession && completedSession.status) return completedSession;

           console.error("[COMPLETE] Checkout session completed:", JSON.stringify(completedSession));
           console.error("[COMPLETE] completedSession state:", completedSession.statusDetails ? completedSession.statusDetails.state : 'Unknown');
           console.error("[COMPLETE] completedSession chargePermissionId:", completedSession.chargePermissionId);
           console.error("[COMPLETE] completedSession chargeId:", completedSession.chargeId);

          var chargePermissionId = completedSession.chargePermissionId;
          if (!chargePermissionId) {
            throw new Error("No charge permission ID in completed session");
          }

          // IMPORTANT: If completeCheckoutSession already created a charge, use that instead
          if (completedSession.chargeId) {
            console.error("[CHARGE] Charge already exists from completeCheckoutSession:", completedSession.chargeId);
            console.error("[CHARGE] Retrieving existing charge instead of creating new one");
            
            return amazonPayV2.getCharge(completedSession.chargeId)
              .then(function(existingCharge) {
                console.error("[CHARGE] Retrieved existing charge:", JSON.stringify(existingCharge));
                
                var chargeState = existingCharge.statusDetails.state;
                var status = paymentConstants.DECLINED;
                
                // AuthorizePayment always creates Authorization interaction
                // Even if Amazon captured the funds immediately with AuthorizeWithCapture
                if (chargeState === 'Authorized' || chargeState === 'AuthorizationInitiated') {
                  status = paymentConstants.AUTHORIZED;
                } else if (chargeState === 'Captured') {
                  status = paymentConstants.CAPTURED;
                }
                
                var response = {
                  awsTransactionId: existingCharge.chargeId,
                  chargePermissionId: existingCharge.chargePermissionId,
                  responseCode: existingCharge.statusDetails.reasonCode || 200,
                  responseText: existingCharge.statusDetails.reasonDescription || chargeState,
                  status: status,
                  amount: parseFloat(existingCharge.chargeAmount.amount),
                  // Don't add separate capture interaction - status=CAPTURED indicates funds are collected
                  captureOnAuthorize: false,
                  captureId: chargeState === 'Captured' ? existingCharge.chargeId : null
                };
                
                return response;
              });
          }

          console.error("payment action :", JSON.stringify(paymentAction));
          console.error("[CHARGE] completedSession chargePermissionId:", chargePermissionId);
          console.error("[CHARGE] completedSession.paymentPreferences:", JSON.stringify(completedSession.paymentPreferences));
          
          // Step 2: Create charge (only if not already created by completeCheckoutSession)
          var captureNow = config.captureOnAuthorize === true;
          
          // IMPORTANT: The charge amount must match what was authorized in the session
          // Use the amount from completedSession if available
          var authorizedAmount = paymentAction.amount;
          var authorizedCurrency = paymentAction.currencyCode;
          
          // Check if completedSession has the authorized amount
          if (completedSession.paymentDetails && completedSession.paymentDetails.chargeAmount) {
            authorizedAmount = completedSession.paymentDetails.chargeAmount.amount;
            authorizedCurrency = completedSession.paymentDetails.chargeAmount.currencyCode;
            console.error("[CHARGE] Using amount from completedSession:", authorizedAmount, authorizedCurrency);
          } else {
            console.error("[CHARGE] Using amount from paymentAction:", authorizedAmount, authorizedCurrency);
          }
          
          var chargePayload = {
            chargePermissionId: chargePermissionId,
            chargeAmount: {
              amount: authorizedAmount,
              currencyCode: authorizedCurrency
            },
            captureNow: captureNow,
            canHandlePendingAuthorization: false
          };
          
          console.error("[CHARGE] Charge payload:", JSON.stringify(chargePayload));

          return amazonPayV2.createCharge(chargePayload)
            .then(function (chargeResult) {
              console.log("Charge created:", chargeResult);

              var chargeId = chargeResult.chargeId;
              var chargeState = chargeResult.statusDetails.state;
              var status = paymentConstants.DECLINED;

              // Map charge state to payment status
              if (chargeState === 'Authorized' || chargeState === 'AuthorizationInitiated') {
                status = paymentConstants.AUTHORIZED;
              } else if (chargeState === 'Captured') {
                status = paymentConstants.CAPTURED;
              }

              var response = {
                awsTransactionId: chargeId,
                chargePermissionId: chargePermissionId,
                responseCode: chargeResult.statusDetails.reasonCode || 200,
                responseText: chargeResult.statusDetails.reasonDescription || chargeState,
                status: status,
                amount:
                  chargeResult.captureAmount && chargeResult.captureAmount.amount
                    ? parseFloat(chargeResult.captureAmount.amount)
                    : chargeResult.chargeAmount && chargeResult.chargeAmount.amount
                      ? parseFloat(chargeResult.chargeAmount.amount)
                      : paymentAction.amount,
                captureOnAuthorize: captureNow
              };

              // If capture on authorize, add capture interaction details
              if (captureNow && chargeState === 'Captured') {
                response.captureId = chargeId; // In v2, charge ID is same for auth and capture
              }

              console.log("Charge response:", response);
              return response;
            })
            .catch(function (chargeErr) {
              console.error("Amazon Pay v2 createCharge error:", chargeErr);
              return {
                status: paymentConstants.DECLINED,
                responseCode: chargeErr.code || 'ERROR',
                responseText: chargeErr.message || 'Charge failed',
              };
            });
        })
        .catch(function (completeErr) {
          console.error("Amazon Pay v2 completeCheckoutSession error:", completeErr);
          return {
            status: paymentConstants.DECLINED,
            responseCode: completeErr.code || 'ERROR',
            responseText: completeErr.message || 'Complete checkout session failed',
          };
        });
    } catch (e) {
      console.error("Exception in confirmAndAuthorizeV2:", e);
      return Promise.resolve({
        status: paymentConstants.DECLINED,
        responseText: e.message || e
      });
    }
  },

  /**
   * Capture a charge (v2)
   * Replaces captureAmount for v2
   */
  captureAmountV2: function (context, config, paymentAction, payment) {
    var self = this;
    console.log("Amazon Pay v2: Capture charge");

    try {
      // Configure v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      // Manual capture handling
      if (paymentAction.manualGatewayInteraction) {
        console.log("Manual capture...dont send to amazon");
        return Promise.resolve({
          amount: paymentAction.amount,
          gatewayResponseCode: "OK",
          status: paymentConstants.CAPTURED,
          awsTransactionId: paymentAction.manualGatewayInteraction.gatewayInteractionId,
        });
      }

      // Find authorized interaction
      var authorizedInteraction = self.getInteractionByStatus(
        payment.interactions,
        paymentConstants.AUTHORIZED
      );

      if (!authorizedInteraction) {
        console.error("No authorized interaction found");
        return Promise.resolve({
          status: paymentConstants.FAILED,
          responseText: "Amazon Charge Id not found in payment interactions",
          responseCode: 500,
        });
      }

      var chargeId = authorizedInteraction.gatewayTransactionId;

      // Convert v1 authorization ID to v2 charge ID if needed
      // V1 auth IDs have 'A' at position 20, v2 charge IDs have 'C'
      chargeId = self.convertV1AuthIdToChargeId(chargeId);
      console.log("Capture charge ID (after v1 conversion if applicable):", chargeId);

      // Create capture payload
      var capturePayload = {
        captureAmount: {
          amount: paymentAction.amount,
          currencyCode: paymentAction.currencyCode
        },
        softDescriptor: "Order Capture"
      };

      // Deterministic idempotency key (Amazon limit: 32 chars) so capture retries dedupe
      // while distinct capture actions on the same payment stay distinct
      var captureIdempotencyKey = crypto
        .createHash("md5")
        .update(
          (payment.id || chargeId) +
            "_" +
            (paymentAction.id || "") +
            "_" +
            paymentAction.amount +
            "_" +
            paymentAction.currencyCode
        )
        .digest("hex");

      return amazonPayV2.captureCharge(chargeId, capturePayload, captureIdempotencyKey)
        .then(function (captureResult) {
          console.log("Capture result:", captureResult);

          var captureState = captureResult.statusDetails.state;

          // A replayed idempotent response may be stale; read the latest charge
          // state so retries reconcile once Amazon finishes capturing
          if (captureState === 'CaptureInitiated' || captureState === 'Pending') {
            return amazonPayV2
              .getCharge(chargeId)
              .then(function (latestCharge) {
                var latestState =
                  (latestCharge.statusDetails && latestCharge.statusDetails.state) ||
                  captureState;
                return { captureResult: captureResult, state: latestState };
              })
              .catch(function () {
                return { captureResult: captureResult, state: captureState };
              });
          }
          return { captureResult: captureResult, state: captureState };
        })
        .then(function (resolved) {
          var captureResult = resolved.captureResult;
          var captureState = resolved.state;
          var status = paymentConstants.FAILED;

          if (captureState === 'Captured') {
            status = paymentConstants.CAPTURED;
          } else if (captureState === 'CaptureInitiated' || captureState === 'Pending') {
            status = paymentConstants.AUTHORIZED; // Capture still in progress at Amazon
          }

          return {
            status: status,
            awsTransactionId: captureResult.chargeId,
            responseText: captureResult.statusDetails.reasonDescription || captureState,
            responseCode: captureResult.statusDetails.reasonCode || 200,
            amount:
              captureResult.captureAmount && captureResult.captureAmount.amount
                ? parseFloat(captureResult.captureAmount.amount)
                : paymentAction.amount,
          };
        })
        .catch(function (err) {
          console.error("Capture error:", err);
          return {
            status: paymentConstants.FAILED,
            responseText: err.message || 'Capture failed',
            responseCode: err.code || 'ERROR',
          };
        });
    } catch (e) {
      console.error("Exception in captureAmountV2:", e);
      return Promise.resolve({
        status: paymentConstants.FAILED,
        responseText: e.message || e
      });
    }
  },

  /**
   * Cancel/void a charge (v2)
   * Replaces voidPayment for v2
   */
  voidPaymentV2: function (context, config, paymentAction, payment) {
    var self = this;
    console.log("Amazon Pay v2: Cancel charge");

    try {
      // Manual void handling
      if (paymentAction.manualGatewayInteraction) {
        console.log("Manual void...dont send to amazon");
        return Promise.resolve({
          amount: paymentAction.amount,
          gatewayResponseCode: "OK",
          status: paymentConstants.VOIDED,
          awsTransactionId: paymentAction.manualGatewayInteraction.gatewayInteractionId,
        });
      }

      // Check if already captured
      var capturedInteraction = self.getInteractionByStatus(
        payment.interactions,
        paymentConstants.CAPTURED
      );

      if (capturedInteraction) {
        return Promise.resolve({
          status: paymentConstants.FAILED,
          responseCode: "InvalidRequest",
          responseText: "Payment with captures cannot be voided. Please issue a refund",
        });
      }

      // Find authorized interaction
      var authorizedInteraction = self.getInteractionByStatus(
        payment.interactions,
        paymentConstants.AUTHORIZED
      );

      if (!authorizedInteraction || context.get.isVoidActionNoOp()) {
        return Promise.resolve({
          status: paymentConstants.VOIDED,
          amount: context.get.isVoidActionNoOp() ? 0 : payment.amountRequested,
        });
      }

      // Configure v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      var chargeId = authorizedInteraction.gatewayTransactionId;

      // Convert v1 authorization ID to v2 charge ID if needed
      chargeId = self.convertV1AuthIdToChargeId(chargeId);
      console.log("Void charge ID (after v1 conversion if applicable):", chargeId);

      var cancelPayload = {
        cancellationReason: paymentAction.reason || "Customer requested cancellation"
      };

      return amazonPayV2.cancelCharge(chargeId, cancelPayload)
        .then(function (result) {
          console.log("Cancel result:", result);
          return {
            status: paymentConstants.VOIDED,
            amount: paymentAction.amount,
            awsTransactionId: chargeId
          };
        })
        .catch(function (err) {
          console.error("Cancel error:", err);
          return {
            status: paymentConstants.FAILED,
            responseText: err.message || 'Cancellation failed',
            responseCode: err.code || 'ERROR',
          };
        });
    } catch (e) {
      console.error("Exception in voidPaymentV2:", e);
      return Promise.resolve({
        status: paymentConstants.FAILED,
        responseText: e.message || e
      });
    }
  },

  /**
   * Create refund (v2)
   * Replaces creditPayment for v2
   */
  creditPaymentV2: function (context, config, paymentAction, payment) {
    var self = this;
    console.log("Amazon Pay v2: Create refund");

    try {
      // Manual credit handling
      if (paymentAction.manualGatewayInteraction) {
        console.log("Manual credit...dont send to amazon");
        return Promise.resolve({
          amount: paymentAction.amount,
          gatewayResponseCode: "OK",
          status: paymentConstants.CREDITED,
          awsTransactionId: paymentAction.manualGatewayInteraction.gatewayInteractionId,
        });
      }

      // Find captured interaction
      var capturedInteraction = self.getInteractionByStatus(
        payment.interactions,
        paymentConstants.CAPTURED
      );

      if (!capturedInteraction) {
        return Promise.resolve({
          status: paymentConstants.FAILED,
          responseCode: "InvalidRequest",
          responseText: "Payment has not been captured to issue refund",
        });
      }

      // Configure v2 SDK
      amazonPayV2.configure({
        publicKeyId: config.publicKeyId,
        privateKey: config.privateKey,
        region: config.region,
        isSandbox: config.isSandbox
      });

      var chargeId = capturedInteraction.gatewayTransactionId;

      // V1 capture IDs (AmazonCaptureId) already have 'C' at position 20,
      // so convertV1AuthIdToChargeId is a no-op for them.
      // But if an auth ID was stored instead, this converts it properly.
      chargeId = self.convertV1AuthIdToChargeId(chargeId);
      console.log("Refund charge ID (after v1 conversion if applicable):", chargeId);

      var refundPayload = {
        chargeId: chargeId,
        refundAmount: {
          amount: paymentAction.amount,
          currencyCode: paymentAction.currencyCode
        },
        softDescriptor: "Refund"
      };

      return amazonPayV2.createRefund(refundPayload)
        .then(function (refundResult) {
          console.log("Refund result:", refundResult);

          var refundState = refundResult.statusDetails.state;
          var status = paymentConstants.FAILED;

          if (refundState === 'Refunded') {
            status = paymentConstants.CREDITED;
          } else if (refundState === 'RefundInitiated') {
            status = paymentConstants.CREDITPENDING;
          }

          return {
            status: status,
            awsTransactionId: refundResult.refundId,
            responseText: refundResult.statusDetails.reasonDescription || refundState,
            responseCode: refundResult.statusDetails.reasonCode || 200,
            amount:
              refundResult.refundAmount && refundResult.refundAmount.amount
                ? parseFloat(refundResult.refundAmount.amount)
                : paymentAction.amount,
          };
        })
        .catch(function (err) {
          console.error("Refund error:", err);
          return {
            status: paymentConstants.FAILED,
            responseText: err.message || 'Refund failed',
            responseCode: err.code || 'ERROR',
          };
        });
    } catch (e) {
      console.error("Exception in creditPaymentV2:", e);
      return Promise.resolve({
        status: paymentConstants.FAILED,
        responseText: e.message || e
      });
    }
  },
});
