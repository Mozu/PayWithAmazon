var PaymentSettings = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings");
var helper = require("./helper");
var _ = require("underscore");
var paymentConstants = require("./constants");
var amazonPay = require("./amazonpaysdk")();

var paymentHelper = (module.exports = {
  getPaymentConfig: function (context) {
    var self = this;
    var fqn = helper.getPaymentFQN(context);
    return helper
      .createClientFromContext(PaymentSettings, context, true)
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
    var awsConfig = context.getSecureAppData("awsConfig");
    if (!awsConfig) return {};

    var environment = helper.getValue(
      paymentSettings,
      paymentConstants.ENVIRONMENT
    );
    var config = {
      isSandbox: environment === "sandbox",
      environment: environment,
      mwsAccessKeyId: awsConfig.mwsAccessKeyId,
      mwsSecret: awsConfig.mwsSecret,
      mwsAuthToken: helper.getValue(
        paymentSettings,
        paymentConstants.AUTHTOKEN
      ),
      sellerId: helper.getValue(paymentSettings, paymentConstants.SELLERID),
      region: helper.getValue(paymentSettings, paymentConstants.REGION),
      clientId: helper.getValue(paymentSettings, paymentConstants.CLIENTID),
      captureOnAuthorize: captureOnAuthorize,
      isEnabled: paymentSettings.isEnabled,
      billingType: helper.getValue(
        paymentSettings,
        paymentConstants.BILLINGADDRESS
      ),
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

    if (!config.mwsAccessKeyId || !config.mwsSecret) {
      callback("Pay With Amazon - AWS Access Key/Secret not found.");
      return;
    }

    if (
      !config.mwsAuthToken ||
      !config.sellerId ||
      !config.region ||
      !config.clientId ||
      !config.environment
    ) {
      callback(
        "Pay With Amazon - Environment/Auth Token/SellerId/Region/ClientId fields are required."
      );
      return;
    }

    //TODO: validate values
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
});
