const _     = require("underscore");
const Guid  = require("guid");


module.exports.getValue = (keyValuePairs, key) => {
    var value = _.findWhere(keyValuePairs, {"key" : key});

    if (!value) {
      console.log(key+" not found");
      return;
    }
    //console.log("Key: "+key, value.value );
    return value.value;
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
