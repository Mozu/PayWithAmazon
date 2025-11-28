module.exports = function (grunt) {
    var path = require('path');
    require('process').env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    'use strict';
    grunt.loadTasks('./tasks');
    require('time-grunt')(grunt);
    require('load-grunt-tasks')(grunt);

    var entries = {};
    grunt.file.expand({cwd: 'assets/src/'}, '**/*.manifest.js').forEach(function(file) {
        var name = file.replace(/\.js$/, '');
        entries[name] = './assets/src/' + file;
    });

    grunt.initConfig({
        mozuconfig: grunt.file.readJSON('./mozu.config.json'),
        jshint: {
            'normal': ['./assets/src/**/*.js'],
            'continuous': {
                'options': { 'force': true },
                'src': '<%= jshint.normal %>'
            }
        },
        webpack: {
            all: {
                entry: entries,
                output: {
                    path: path.resolve(__dirname, 'assets/dist'),
                    filename: '[name].all.js',
                    library: {
                        type: 'commonjs'
                    }
                },
                target: 'node',
                mode: 'production',
                optimization: {
                    minimize: false
                },
                resolve: {
                    extensions: ['.js', '.json']
                }
            }
        },
        manifest: { 
            'all': { 
                'files': [{
                    'expand': true,
                    'cwd': 'assets/src/',
                    'src': ['**/*.manifest.js'],
                    'dest': 'assets/dist/',
                    'ext': '.all.js',
                    'extDot': 'last'
                }]
            } 
        },
        mozusync: {
            'options': {
                'applicationKey': '<%= mozuconfig.workingApplicationKey %>',
                'context': '<%= mozuconfig %>',
                'watchAdapters': [
                    {
                        'src': 'mozusync.upload.src',
                        'action': 'upload',
                        'always': ['./assets/functions.json']
                    },
                    {
                        'src': 'mozusync.del.remove',
                        'action': 'delete'
                    }
                ]
            },
            'upload': {
                'options': {
                    'action': 'upload',
                    'noclobber': false,
                    'ignoreChecksum': true
                },
                'src': ['./assets/**/*'],
                'filter': 'isFile'
            },
            'del': {
                'options': { 'action': 'delete' },
                'src': '<%= mozusync.upload.src %>',
                'filter': 'isFile',
                'remove': []
            },
            'wipe': {
                'options': { 'action': 'deleteAll' },
                'src': '<%= mozusync.upload.src %>'
            }
        },
        watch: {
            'options': { 'spawn': false },
            'src': {
                'files': '<%= jshint.normal %>',
                'tasks': [
                    'jshint:continuous',
                    'webpack:all',
                    'manifest'
                ]
            },
            'sync': {
                'files': ['assets/**/*'],
                'tasks': [
                    'mozusync:upload',
                    'mozusync:del'
                ]
            }
        },
        mochaTest: {
            'all': {
                'clearRequireCache': true,
                'src': ['assets/test/**/*.js']
            }
        }
    });
    grunt.registerTask('build', [
        'jshint:normal',
        'webpack:all',
        'manifest',
        'test'
    ]);
    grunt.registerTask('default', [
        'build',
        'mozusync:upload'
    ]);
    grunt.registerTask('reset', [
        'mozusync:wipe',
        'mozusync:upload'
    ]);
    grunt.registerTask('cont', ['watch']);
    grunt.registerTask('c', ['watch']);
    grunt.registerTask('w', ['watch']);
    grunt.registerTask('test', ['mochaTest']);
};