const express   = require('express');
const router    = express.Router();
const pwaSDK    = require("../pwasdk");
const errorHandler = require('../helper').errorHandler;



router.post('/', async (req, res, next) => {
    //pwaSDK.configure(req.body.config);
    

    try {
        const token = req.body.token.token;
        const orderReferenceId = token.awsReferenceId;
        const transaction = req.body.context.transaction;
        const orderNumber = transaction.kiboTransactionId;
        const currencyCode = transaction.currencyCode;
        const amount = req.body.amount;
        const config = req.body.config;
        const awsOrder = await pwaSDK.getOrderDetails(orderReferenceId, null,config);
        const captureOnAuthorize = req.body.captureOnAuth;
        const status = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails.OrderReferenceStatus.State;
        if (status === "Draft") {
            await pwaSDK.setOrderDetails(orderReferenceId, {amount,currencyCode,orderNumber}, config);
            await pwaSDK.confirmOrder(orderReferenceId, config);
        }

        if (status === "Canceled") {
            res.json(
                {remoteConnectionStatus: "Success",
                "isDeclined": true,
                "responseCode" : "Error",
                "responseText" : orderReferenceId +" is in "+status
            });
            return;
        }

        const authResponse = await pwaSDK.requestAuthorzation(orderReferenceId,amount,currencyCode,transaction.id,captureOnAuthorize,config);
        const authDetails = authResponse.AuthorizeResponse.AuthorizeResult.AuthorizationDetails;
        const awsTransactionId = authDetails.AmazonAuthorizationId;
        const authorizationReferenceId = authDetails.AuthorizationReferenceId;

        let captureId = null;

        if (captureOnAuthorize)
            captureId = authDetails.IdList.member;


        const state = authDetails.AuthorizationStatus.State;
        let isAuthorized = state == "Open" || state == "Closed";

        let response = {
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined": !isAuthorized,
            "authCode" : awsTransactionId,
            "transactionId" : (captureId ?  captureId : authorizationReferenceId),
            "responseCode" : 200,
            "responseText" : state,
            "responseData" : [
                { "key" : "awsAuthorizationId", "value" : awsTransactionId },
                { "key" : "authorizationReferenceId", "value" :authorizationReferenceId }
            ]
        };

        if (captureId) {
            response.responseData.push({"key" : "captureId","value" : captureId});
        }

        res.json(response);
    } catch(err) {
        errorHandler(res, err);
    }

});


module.exports = router;