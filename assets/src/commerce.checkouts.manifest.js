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
  