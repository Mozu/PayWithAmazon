/*
 * This custom function was generated by the Actions Generator
 * in order to enable the other custom functions in this app
 * upon installation into a tenant.
 */

var ActionInstaller = require('mozu-action-helpers/installers/actions');
//var paymentSettingsClient = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings")();
var tennatClient = require("mozu-node-sdk/clients/platform/tenant")();
var constants = require('mozu-node-sdk/constants');
var async = require("async");
var paymentConstants = require("../../constants");
var _ = require("underscore");

function AppInstall(context, callback) {
	var self = this;
	self.ctx = context;
	self.cb = callback;

	self.initialize = function() {
		console.log(context);
		console.log("Getting tenant", self.ctx.apiContext.tenantId);
		tennatClient.getTenant({tenantId: self.ctx.apiContext.tenantId})
		.then(function(tenant){
			enableAmazonPaymentWorkflow(tenant);
		}, self.cb);
	};

	function enableAmazonPaymentWorkflow(tenant) {

		try {
			console.log("Installing amazon payment settings", tenant);
			var paymentDef = {
		    "name": paymentConstants.PAYMENTSETTINGID,
		    "namespace": context.get.nameSpace(),
		    "isEnabled": "false",
		    "credentials":  [
			    	getPaymentActionFieldDef("Environment", paymentConstants.ENVIRONMENT, "RadioButton", false,getEnvironmentVocabularyValues()),
			    	getPaymentActionFieldDef("Seller Id", paymentConstants.SELLERID, "TextBox", false,null),
			    	getPaymentActionFieldDef("Client Id", paymentConstants.CLIENTID, "TextBox", false,null),
			    	getPaymentActionFieldDef("Application Id", paymentConstants.APPID, "TextBox", true,null),
			    	getPaymentActionFieldDef("AWS Access Key", paymentConstants.AWSACCESSKEYID, "TextBox", true.null),
			    	getPaymentActionFieldDef("AWS Secret", paymentConstants.AWSSECRET, "TextBox", true,null),
			    	getPaymentActionFieldDef("AWS Region", paymentConstants.REGION, "RadioButton", false,getRegions()),
			    	getPaymentActionFieldDef("Order Processing", paymentConstants.ORDERPROCESSING, "RadioButton", true,getOrderProcessingVocabularyValues()),
			    	getPaymentActionFieldDef("Button Color", paymentConstants.BUTTONCOLOR, "RadioButton", false,getButtonColorValues()),
			    	getPaymentActionFieldDef("Button Type", paymentConstants.BUTTONTYPE, "RadioButton", false,getButtonTypeValues()),
			    	getPaymentActionFieldDef("Use Popup Window", paymentConstants.POPUP, "RadioButton", false,getPopupValues())
			    ]
			};

			console.log("Amazon Payment definition", paymentDef);

			var tasks = tenant.sites.map(function(site) {
											console.log("Adding payment settings for site", site.id);
											var paymentSettingsClient = require("mozu-node-sdk/clients/commerce/settings/checkout/paymentSettings")();
											paymentSettingsClient.context[constants.headers.SITE] = site.id;
											//GetExisting 
											return paymentSettingsClient.getThirdPartyPaymentWorkflows({}).then(function(paymentSettings){
												var existing = _.findWhere(paymentSettings, {"name" : paymentDef.name});
												
												if (!existing) 
													return paymentSettingsClient.addThirdPartyPaymentWorkflow(paymentDef);
												else
													console.log("Amazon payment Def exists for "+site.id);
											});
										});

			Promise.all(tasks).then(function(result) {
				console.log("Amazon payment definition installed");
				enableActions();
			}, function(error) {
				self.cb(error);
			});
		} catch(e) {
			self.cb(e);
		}
	}




	function enableActions() {
		console.log("installing code actions");
		var installer = new ActionInstaller({ context: self.ctx.apiContext });
	 	installer.enableActions(context).then(self.cb.bind(null, null), self.cb);	
	}


	function getPopupValues() {
		return [
			getVocabularyContent("true", "en-US", "Yes"),
			getVocabularyContent("false", "en-US", "No")
		];
	}

	function getButtonTypeValues() {
		return [
			getVocabularyContent("PwA", "en-US", "Pay With Amazon"),
			getVocabularyContent("Pay", "en-US", "Pay"),
			getVocabularyContent("A", "en-US", "Only Amazon Payments Logo")
		];
	}

	function getButtonColorValues() {
		return [
			getVocabularyContent("Gold", "en-US", "Gold"),
			getVocabularyContent("LightGray", "en-US", "Light Gray"),
			getVocabularyContent("DarkGray", "en-US", "Dark Gray")
		];
	}

	function getRegions() {
		return [
			getVocabularyContent("de", "en-US", "DE"),
			getVocabularyContent("uk", "en-US", "UK"),
			getVocabularyContent("us", "en-US", "US"),
			getVocabularyContent("jp", "en-US", "JP")
		];
	}

	function getEnvironmentVocabularyValues() {
		return [
			getVocabularyContent("production", "en-US", "Production"),
			getVocabularyContent("sandbox", "en-US", "Sandbox")
		];
	}

	function getOrderProcessingVocabularyValues() {
		return [
			getVocabularyContent(paymentConstants.CAPTUREONSUBMIT, "en-US", "Authorize and Capture on Order Placement"),
			getVocabularyContent(paymentConstants.CAPTUREONSHIPMENT, "en-US", "Authorize on Order Placement and Capture on Order Shipment")
		];
	}

	function getVocabularyContent(key, localeCode, value) {
		return {
			"key" : key,
			"contents" : [{
				"localeCode" : localeCode,
				"value" : value
			}]
		};
	}

	function getPaymentActionFieldDef(displayName, key, type, isSensitive, vocabularyValues) {
		return {
	          "displayName": displayName,
	          "apiName": key,
	          "inputType": type,
	          "isSensitive": isSensitive,
	          "vocabularyValues" : vocabularyValues
		};
	}


}

/*function enableAmazonPaymentWorkflow(context, callback) {
	var paymentDef = {
	    "name": "PayByAmazon",
	    "namespace": context.get.nameSpace(),
	    "isEnabled": "false",
	    "credentials":  [
	    	getPaymentActionFieldDef("Environment", "environment", "RadioButton", false,getEnvironmentVocabularyValues()),
	    	getPaymentActionFieldDef("Seller Id", "sellerId", "TextBox", false,null),
	    	getPaymentActionFieldDef("Client Id", "clientId", "TextBox", false,null),
	    	getPaymentActionFieldDef("Application Id", "appId", "TextBox", true,null),
	    	getPaymentActionFieldDef("AWS Access Key", "awsAccessKeyId", "TextBox", true.null),
	    	getPaymentActionFieldDef("AWS Secret", "awsSecret", "TextBox", true,null),
	    	getPaymentActionFieldDef("AWS Region", "region", "RadioButton", false,null),
	    	getPaymentActionFieldDef("Order Processing", "orderProcessing", "Radio", false,getOrderProcessingVocabularyValues())
	    ]
	};
	
	paymentSettingsClient.addThirdPartyPaymentWorkflow({body: paymentDef}).then(function() {
		enableActions(context, callback);
	}, function(e) {
		callback(e);
	});
}*/



module.exports = function(context, callback) {
	/*tennatClient.getTenant({tenantId: context.apiContext.tenantId}).then()

	console.log("App installed context", context);
  	enableAmazonPaymentWorkflow(context, callback);*/

  	try {
  		var appInstall = new AppInstall(context, callback);
  		appInstall.initialize();
  	} catch(e) {
  		callback(e);
  	}

};