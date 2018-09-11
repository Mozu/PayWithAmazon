const express   = require('express');
const router    = express.Router();
const validateToken    = require("../pwasdk").validateToken;


router.post('/', async (req, res, next) => {

    //pwaSDK.configure(req.body.config);
    
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
        console.log(err);
        res.json({
            remoteConnectionStatus: err.remoteConnectionStatus,
            responseCode : "Error",
            "isDeclined": true,
            response: {
                error: err,
            }
        });
    }

});



module.exports = router;