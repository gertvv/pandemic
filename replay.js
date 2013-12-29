var _ = require("underscore");
var clone = require("clone");
var fs = require('fs');

eval(fs.readFileSync('./public/js/replay.js').toString());

module.exports = Replay;
