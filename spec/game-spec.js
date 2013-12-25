var Game = require("../game");
var initializeGame = require("../initializeGame");
var _ = require("underscore");
var fs = require("fs");

var defaultGameDef = require('../defaultGameDef');

describe("Game", function() {
  var gameDef;

  beforeEach(function() {
    gameDef = initializeGame(defaultGameDef);
  });
  
  it("should have a setup method", function() {
    var game = new Game(gameDef, ["7aBf9", "UIyVz"], {}, {});
    expect(game.setup).toEqual(jasmine.any(Function));
  });
});
