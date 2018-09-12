const express           = require('express');
const router            = express.Router();
const validateToken     = require("../pwasdk").validateToken;
const helper            = require('../helper');

router.post('/', async (req, res, next) => {

    try {
        const payload = req.body.payload;
        const profile = await validateToken(payload.access_token, req.body.config);
        console.log(profile);
        res.json({
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined": false,
            response: profile
            });
    } catch(err) {
        helper.errorHandler(res, err, true);
    }

});



module.exports = router;