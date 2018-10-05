const log4js = require('log4js');
var logger = log4js.getLogger();

logger.level = process.env.logLevel || "info";

module.exports = logger;