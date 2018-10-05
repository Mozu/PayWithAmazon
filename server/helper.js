const _     = require("underscore");
const Guid  = require("guid");
const logger = require('./logger');

module.exports.getValue = (keyValuePairs, key) => {
    var value = _.findWhere(keyValuePairs, {"key" : key});

    if (!value) {
      console.log(key+" not found");
      return;
    }
    //console.log("Key: "+key, value.value );
    return value.value;
}

module.exports.getInteractionById = (interactions, gatewayInteractionid,transactionType) => {
  console.log(interactions);
  var interaction = _.findWhere(interactions, {"id": gatewayInteractionid});

  if (!interaction || interaction.transactionType !== transactionType) {
    console.log("Transcation type "+transactionType+" not found");
    return;
  }

  return interaction;
}

module.exports.getInteractionByStatus = (interactions, transactionType) => {
  console.log(interactions);
  var interaction = _.findWhere(interactions, {"transactionType": transactionType});
  if (!interaction) {
    console.log("Transcation type "+transactionType+" not found");
    return;
  }

  return interaction;
}


module.exports.getGuid = 	() => {
  var guid = Guid.create();
  return guid.value.replace(/\-/g, "");
}

module.exports.errorHandler = (res, err, addRawError) => {
    logger.error(err);
    let errorResponse = {
        remoteConnectionStatus: err.remoteConnectionStatus,
        "isDeclined": true
      };
    
    if (!addRawError) {
      errorResponse.responseCode = err.code;
      errorResponse.responseText = err.message;
    } else {
      errorResponse.responseCode = "Error";
      errorResponse.response = {error : err};
    }
    logger.error(JSON.stringify(errorResponse));
    res.json(errorResponse);
}