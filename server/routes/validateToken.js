const express           = require('express');
const router            = express.Router();
const validateToken     = require("../pwasdk").validateToken;
const helper            = require('../helper');
const logger            = require('../logger');

router.post('/', async (req, res, next) => {

    try {
        const payload = req.body.payload;
        const profile = await validateToken(payload.access_token, req.body.config);
        logger.info(JSON.stringify(profile));
        const response = {
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined": false,
            response: profile
            };
        logger.info(JSON.stringify(response));    
        res.json(response);
    } catch(err) {
        helper.errorHandler(res, err, true);
    }

});



module.exports = router;