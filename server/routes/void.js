const router   = require('express').Router();
const cancelOrder   = require("../pwasdk").cancelOrder;
const closeAuthorization = require('../pwasdk').closeAuthorization;
const helper   = require('../helper');
const _  = require('underscore');


router.post('/', async (req, res, next) => {
    try {
        
        const config = req.body.config;
        const token = req.body.token.token;
        const context = req.body.context;
        const previousTransactions = context.previousTransactions;

        var captureTran = _.map(previousTransactions, (tran) => {
            var authTran = helper.getInteractionByStatus(tran.gatewayInteractions, "Capture");
            if (authTran)
                return tran;
        })

        console.log("capture tran",captureTran);
        let requestId = "";
        if (captureTran.length > 0) {
            const authorization = helper.getInteractionByStatus(context.transaction.gatewayInteractions, "Authorize");
            const authorizationId = helper.getValue(authorization.responseData,"awsAuthorizationId");
            if (authorizationId == null) {
                throw {code: "TransactionNotFound", message: "Authorization Id not found"};
            }
            const closeAuthResponse = await closeAuthorization(authorizationId, config);
            requestId = closeAuthResponse.CloseAuthorizationResponse.ResponseMetadata.RequestId;
            
        } else {
            const cancelResponse = await cancelOrder(token.awsReferenceId,config);
            requestId = cancelResponse.CancelOrderReferenceResponse.ResponseMetadata.RequestId;
        }

        res.json({
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined":  false,
            "transactionId" : requestId,
            "responseCode" : 200,
            "responseText" : "Closed",
            "responseData" : [
                { "key" : "requestId", "value" : requestId }
            ]
        });
    } catch(err) {
        console.log(err);
        res.json(
            {remoteConnectionStatus: err.remoteConnectionStatus,
            "isDeclined": true,
            "responseCode" : err.code,
            "responseText" : err.message
        });
    }
});


module.exports = router;