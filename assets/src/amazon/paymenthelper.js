var PaymentSettings = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings");
var helper = require("./helper");
var _ = require("underscore");
var paymentConstants = require("./constants");
var amazonPay = require("./amazonpaysdk")();
var amazonPayV2 = require("./amazonpaysdkv2")();

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
    var config = {
      isSandbox: environment === "sandbox",
      environment: environment,
      region: helper.getValue(paymentSettings, paymentConstants.REGION),
      captureOnAuthorize: captureOnAuthorize,
      isEnabled: paymentSettings.isEnabled,
      billingType: helper.getValue(
        paymentSettings,
        paymentConstants.BILLINGADDRESS
      ),

      // Amazon Pay API v2 credentials
      publicKeyId: helper.getValue(paymentSettings, "publicKeyId"),
      privateKey: helper.getValue(paymentSettings, "privateKey"),
      storeId: helper.getValue(paymentSettings, "storeId"),
      merchantId: helper.getValue(paymentSettings, "merchantId"),
    };
    return Promise.resolve(config);
  },
  validatePaymentSettings: function (context, callback) {
    var self = this;
    var paymentSettings = context.request.body;

    var pwaSettings = _.findWhere(
      paymentSettings.externalPaymentWorkflowDefinitions,
      { fullyQualifiedName: helper.getPaymentFQN(context) }
    );

    if (!pwaSettings || !pwaSettings.IsEnabled) callback();

    var config = self.getConfig(context, pwaSettings);

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
    payment.interactions.push(interaction);
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
      payment.interactions.push(captureInteraction);
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
    if (paymentAction.amount === 0) return newStatus;

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
      return { status: paymentConstants.FAILED, responseText: e };
    }
  },
  authorizePayment: function (context, paymentAction, payment) {
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
                if (captureOnAuthorize) {
                  captureId = authDetails.IdList.member;
                }

                var response = {
                  awsTransactionId: awsTransactionId,
                  captureId: captureId,
                  responseCode: 200,
                  responseText: state,
                  status: status,
                  amount: payment.amountRequested,
                  captureOnAuthorize: captureOnAuthorize,
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
            return self.authorizePayment(context, paymentAction, payment);
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
    console.log("Configuration:",context.configuration);
    if (context.configuration && context.configuration.payment){      
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

        var capturedInteractionWithPendingState = _.findWhere(interactions, {status: "Failed", gatewayResponseText: "Pending"});
        if(capturedInteractionWithPendingState){
          console.log("Found capture interaction with pending status");
          var amazonCaptureId = capturedInteractionWithPendingState.gatewayTransactionId;
          return amazonPay
          .getCaptureDetails(amazonCaptureId)
          .then(function(captureResponse){
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
              responseText: "Capture Status: "+state,
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
      Promise.resolve(response);
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
      Promise.resolve(errorResponse);
    }

    var authorizedInteraction = self.getInteractionByStatus(
      payment.interactions,
      paymentConstants.AUTHORIZED
    );
    if (!authorizedInteraction || context.get.isVoidActionNoOp())
      return {
        status: paymentConstants.VOIDED,
        amount: context.get.isVoidActionNoOp() ? 0 : payment.amount,
      };

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
    if (paymentAction.manualGatewayInteraction) {
      console.log("Manual decline...dont send to amazon");
      var response = {
        amount: paymentAction.amount,
        gatewayResponseCode: "OK",
        status: paymentConstants.DECLINED,
        awsTransactionId:
          paymentAction.manualGatewayInteraction.gatewayInteractionId,
      };
      Promise.resolve(response);
    }
    var capturedInteraction = getInteractionByStatus(
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
      Promise.resolve(errorResponse);
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
  },

  // ========================================
  // Amazon Pay API v2 Methods
  // ========================================

  /**
   * Determine if this is a v2 checkout session or v1 order reference
   */
  isCheckoutSession: function(payment) {
    return payment.externalTransactionId &&
           payment.externalTransactionId.indexOf('amzn-checkout-') === 0;
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
      var completePayload = {
        chargeAmount: {
          amount: paymentAction.amount,
          currencyCode: paymentAction.currencyCode
        }
      };

      return amazonPayV2.completeCheckoutSession(checkoutSessionId, completePayload)
        .then(function(completedSession) {
          console.log("Checkout session completed:", completedSession);

          var chargePermissionId = completedSession.chargePermissionId;
          if (!chargePermissionId) {
            throw new Error("No charge permission ID in completed session");
          }

          // Step 2: Create charge
          var captureNow = config.captureOnAuthorize === true;
          var chargePayload = {
            chargePermissionId: chargePermissionId,
            chargeAmount: {
              amount: paymentAction.amount,
              currencyCode: paymentAction.currencyCode
            },
            captureNow: captureNow,
            canHandlePendingAuthorization: false
          };

          return amazonPayV2.createCharge(chargePayload)
            .then(function(chargeResult) {
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
                amount: paymentAction.amount,
                captureOnAuthorize: captureNow
              };

              // If capture on authorize, add capture interaction details
              if (captureNow && chargeState === 'Captured') {
                response.captureId = chargeId; // In v2, charge ID is same for auth and capture
              }

              console.log("Charge response:", response);
              return response;
            });
        })
        .catch(function (err) {
          console.error("Amazon Pay v2 charge error:", err);
          return {
            status: paymentConstants.DECLINED,
            responseCode: err.code || 'ERROR',
            responseText: err.message || 'Charge failed',
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

      // Create capture payload
      var capturePayload = {
        captureAmount: {
          amount: paymentAction.amount,
          currencyCode: paymentAction.currencyCode
        },
        softDescriptor: "Order Capture"
      };

      return amazonPayV2.captureCharge(chargeId, capturePayload)
        .then(function(captureResult) {
          console.log("Capture result:", captureResult);

          var captureState = captureResult.statusDetails.state;
          var status = paymentConstants.FAILED;

          if (captureState === 'Captured') {
            status = paymentConstants.CAPTURED;
          } else if (captureState === 'Pending') {
            status = paymentConstants.FAILED; // Will retry or handle pending
          }

          return {
            status: status,
            awsTransactionId: captureResult.chargeId,
            responseText: captureResult.statusDetails.reasonDescription || captureState,
            responseCode: captureResult.statusDetails.reasonCode || 200,
            amount: paymentAction.amount,
          };
        })
        .catch(function(err) {
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
          amount: context.get.isVoidActionNoOp() ? 0 : payment.amount,
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
      var cancelPayload = {
        cancellationReason: paymentAction.reason || "Customer requested cancellation"
      };

      return amazonPayV2.cancelCharge(chargeId, cancelPayload)
        .then(function(result) {
          console.log("Cancel result:", result);
          return {
            status: paymentConstants.VOIDED,
            amount: paymentAction.amount,
            awsTransactionId: chargeId
          };
        })
        .catch(function(err) {
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
      var refundPayload = {
        chargeId: chargeId,
        refundAmount: {
          amount: paymentAction.amount,
          currencyCode: paymentAction.currencyCode
        },
        softDescriptor: "Refund"
      };

      return amazonPayV2.createRefund(refundPayload)
        .then(function(refundResult) {
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
            amount: paymentAction.amount,
          };
        })
        .catch(function(err) {
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
