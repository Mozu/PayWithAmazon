const router   = require('express').Router();
const capture    = require("../pwasdk").capture;
const helper  = require('../helper');



router.post('/', async (req, res, next) => {

    try {
        const transaction = req.body.context.transaction;
        const currencyCode = transaction.currencyCode;
        const amount = req.body.amount;
        const config = req.body.config;
        const authInteraction = helper.getInteractionByStatus(transaction.gatewayInteractions,"Authorize");
        if (!authInteraction) {
            throw {code: "AuthNotFound", message: "Authorization not found for capture request"};
        }

        const authorizationId = helper.getValue(authInteraction.responseData,"awsAuthorizationId");
        if (authorizationId == null) {
            throw {code: "TransactionNotFound", message: "Authorization Id not found"};
        }
        
        const captureResponse = await capture(authorizationId,amount,currencyCode,helper.getGuid(),config);
        const captureDetails = captureResponse.CaptureResponse.CaptureResult.CaptureDetails;
        const state = captureDetails.CaptureStatus.State;
        const captureId = captureDetails.AmazonCaptureId;
        res.json({
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined":  state != "Completed",
            "authCode" : captureId,
            "transactionId" : captureId,
            "responseCode" : 200,
            "responseText" : state,
            "responseData" : [
                { "key" : "captureId", "value" : captureId }
            ]
        });
    } catch(err) {
        helper.errorHandler(res, err);
    }

});


module.exports = router;