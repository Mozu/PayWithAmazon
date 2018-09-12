const express = require("express");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const app = express();
const tokenDetails = require('./routes/tokendetails');
const authorizewithtoken = require('./routes/authorizewithtoken');
const capture = require('./routes/capture');
const credit = require('./routes/credit');
const voidTran = require('./routes/void');
const validateToken = require('./routes/validateToken');
const helper = require('./helper');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser())

app.use((req, res, next) => {

    if (!req.body || !req.body.context) {
        return next();
    }

    const settings = req.body.context.settings;
    const configuration = req.body.context.configuration;

    let config = {
        "mwsAccessKeyId": helper.getValue(configuration, "mwsAccessKeyId"),
        "mwsSecret": helper.getValue(configuration, "mwsSecret"),
        "sellerId": helper.getValue(settings, "sellerId"),
        "clientId": helper.getValue(settings, "clientId"),
        "environment": helper.getValue(settings, "environment"),
        "mwsAuthToken": helper.getValue(settings, "mwsAuthToken"),
        "awsRegion": helper.getValue(settings, "awsRegion"),

    }

    config.isSandbox = config.environment == "sandbox";

    req.body.config = config;

    next();
});

app.use("/tokendetails", tokenDetails);
app.use("/authorizewithtoken", authorizewithtoken);
app.use("/capture", capture);
app.use("/credit", credit);
app.use('/void', voidTran);
app.use('/validateToken', validateToken);
app.get('/', function(req, res) {
    res.send('Paywith amazon extensible implementation using node '+process.version);
});

module.exports = app;