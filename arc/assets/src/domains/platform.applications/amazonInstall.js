/*
 * This custom function was generated by the Actions Generator
 * in order to enable the other custom functions in this app
 * upon installation into a tenant.
 */

var ActionInstaller = require('mozu-action-helpers/installers/actions');

module.exports = function(context, callback)   {

	var actionInstaller = new ActionInstaller(context.apiContext);
 
	actionInstaller.enableActions(context).then(callback.bind(null, null), callback);
};