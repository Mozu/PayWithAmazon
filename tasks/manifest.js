var path = require('path');
module.exports = function(grunt) {
    grunt.registerMultiTask('manifest', 'Compiles the `functions.json` manifest for the Mozu Actions Framework to read which custom functions are extended.', function () {
        var manifest = this.files.reduce(function (functionsManifest, conf) {
            grunt.log.writeln('Processing: ' + conf.src[0]);
            try {
                var index = require('../' + conf.src[0].replace(/\.js$/,''));
                return functionsManifest.concat(Object.keys(index).map(function (key) {
                    return {
                        id: key,
                        virtualPath: './' + path.relative('assets', conf.dest),
                        actionId: index[key].actionName
                    };
                }));
            } catch (e) {
                grunt.log.error('Error processing ' + conf.src[0] + ': ' + e.message);
                grunt.log.error(e.stack);
                throw e;
            }
        }, []);
        grunt.file.write('./assets/functions.json', JSON.stringify({ exports: manifest }, null, 2));
        grunt.log.ok('Wrote ' + manifest.length + ' custom functions to functions.json');
    });
};