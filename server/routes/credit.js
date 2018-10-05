const router   = require('express').Router();
const refund   = require("../pwasdk").refund;
const helper   = require('../helper');
const logger   = require('../logger');


router.post('/', async (req, res, next) => {
    try {
        const transaction = req.body.context.transaction;
        const currencyCode = transaction.currencyCode;
        const amount = req.body.amount;
        const config = req.body.config;
        const gatewayInteractionId = req.body.gatewayInteractionId;
        const captureInteractionType = "Capture";
        let captureInteraction = null;

        if (gatewayInteractionId)
            captureInteraction = helper.getInteractionById(transaction.gatewayInteractions,gatewayInteractionId,captureInteractionType);
        else
           captureInteraction = helper.getInteractionByStatus(transaction.gatewayInteractions,captureInteractionType);

        if (!captureInteraction)
            captureInteraction = helper.getInteractionByStatus(transaction.gatewayInteractions, "AuthorizeAndCapture");
            
        if (!captureInteraction) {
            throw {code: "CaptureNotFound", message: "Capture not found for credit request"};
        }

        const captureId = helper.getValue(captureInteraction.responseData,"captureId");
        if (captureId == null) {
            throw {code: "TransactionNotFound", message: "Capture Id not found"};
        }
        
        const creditResponse = await refund(captureId,{amount,currencyCode, id: helper.getGuid(), orderNumber: transaction.kiboTransactionId},config);
        const creditDetails =  creditResponse.RefundResponse.RefundResult.RefundDetails;
        const state = creditDetails.RefundStatus.State;
        const creditId = creditDetails.AmazonRefundId;
        const response = {
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined":  state != "Pending" && state != "Completed",
            "authCode" : creditId,
            "transactionId" : creditId,
            "responseCode" : 200,
            "responseText" : state,
            "responseData" : [
                { "key" : "creditId", "value" : creditId }
            ]
        };
        logger.info(JSON.stringify(response));
        res.json(response);
    } catch(err) {
        helper.errorHandler(res, err);
    }
});


module.exports = router;