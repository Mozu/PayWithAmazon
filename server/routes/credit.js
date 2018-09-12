const router   = require('express').Router();
const refund   = require("../pwasdk").refund;
const helper   = require('../helper');



router.post('/', async (req, res, next) => {
    try {
        const transaction = req.body.context.transaction;
        const currencyCode = transaction.currencyCode;
        const amount = req.body.amount;
        const config = req.body.config;
        let captureInteraction = helper.getInteractionByStatus(transaction.gatewayInteractions,"Capture");

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
        res.json({
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
        });
    } catch(err) {
        helper.errorHandler(res, err);
    }
});


module.exports = router;