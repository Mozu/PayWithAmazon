(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.index = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = {

    'http.commerce.checkouts.addDestination.before': {
        actionName: 'http.commerce.checkouts.addDestination.before',
        customFunction: require('./domains/commerce.checkouts/http.commerce.checkouts.addDestination.before')
    },
    'http.commerce.checkouts.updateDestination.before': {
        actionName: 'http.commerce.checkouts.updateDestination.before',
        customFunction: require('./domains/commerce.checkouts/http.commerce.checkouts.updateDestination.before')
    }
  };
  
},{"./domains/commerce.checkouts/http.commerce.checkouts.addDestination.before":2,"./domains/commerce.checkouts/http.commerce.checkouts.updateDestination.before":3}],2:[function(require,module,exports){
/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


//var AmazonCheckout = require("../../amazoncheckout");


//var AmazonCheckout = require("../../amazon/checkout");

module.exports = function(context, callback) {

	try {	
		//console.log(context.request.params);
		//var amazonCheckout = new AmazonCheckout(context, callback);
		//amazonCheckout.addDestination();
		callback();
    } catch(e) {
	   callback(e);
	}
  
};
},{}],3:[function(require,module,exports){
/**
 * Implementation for http.storefront.pages.global.request.before
 * This function will receive the following context object:

{
  &#34;type&#34;: &#34;mozu.actions.context.http&#34;
}

 */


//var AmazonCheckout = require("../../amazoncheckout");


//var AmazonCheckout = require("../../amazon/checkout");

module.exports = function(context, callback) {

	try {	
		console.log(context.request.params);
		//var amazonCheckout = new AmazonCheckout(context, callback);
		//  amazonCheckout.addDestination();
		callback();
    } catch(e) {
		console.error(e);
	   callback(e);
	}
  
};
},{}]},{},[1])(1)
});