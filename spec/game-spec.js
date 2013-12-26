var Game = require("../game");
var initializeGame = require("../initializeGame");
var _ = require("underscore");
var fs = require("fs");

var defaultGameDef = require('../defaultGameDef');

describe("Game", function() {
  var gameDef;
  var randy;
  var emitter;

  beforeEach(function() {
    gameDef = initializeGame(defaultGameDef);
    randy = {
      sample: function(population, count) { return ["Medic", "Scientist"]; },
      shuffle: function(arr) { return _.clone(arr).reverse(); },
      randInt: function(min, max) { return min; }
    };
    emitter = {
      emit: function(event) {}
    };
  });
  
  describe(".setup()", function() {
    it("should assign roles", function() {
      spyOn(randy, "sample").andCallThrough();
      //spyOn(randy, "shuffle");
      //spyOn(randy, "randInt");
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.sample).toHaveBeenCalledWith([
        "Dispatcher",
        "Operations Expert",
        "Scientist",
        "Medic",
        "Researcher"], 2);
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.players).toEqual(
          [ { "id": "7aBf9", "role": "Medic" }, { "id": "UIyVz", "role": "Scientist" } ]);
    });

    it("should shuffle infection cards", function() {
      spyOn(randy, "shuffle").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.shuffle).toHaveBeenCalledWith(gameDef.infection_cards_draw);
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.infection_cards_draw).toEqual(
        _.clone(gameDef.infection_cards_draw).reverse());
    });

    it("should shuffle player cards", function() {
      spyOn(randy, "shuffle").andCallThrough();
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.shuffle).toHaveBeenCalledWith(gameDef.player_cards_draw);
    });

    it("should insert epidemics into player cards (2 players, 4 epidemics)", function() {
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.randInt.calls.length).toBe(4);

      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 2*4 = 8 player cards are reserved
      // The remaining 53 - 8 = 45 are divided into 4 piles: 12, 11, 11, 11
      var expected =
        cards.slice(0, 8)
        .concat([epidemic])
        .concat(cards.slice(8, 20))
        .concat([epidemic])
        .concat(cards.slice(20, 31))
        .concat([epidemic])
        .concat(cards.slice(31, 42))
        .concat([epidemic])
        .concat(cards.slice(42, 53));

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.player_cards_draw).toEqual(expected)
    });

    it("should insert epidemics into player cards (3 players, 4 epidemics)", function() {
      spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz", "hi7H9"],
        { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.randInt.calls.length).toBe(4);

      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 9)
        .concat([epidemic])
        .concat(cards.slice(9, 20))
        .concat([epidemic])
        .concat(cards.slice(20, 31))
        .concat([epidemic])
        .concat(cards.slice(31, 42))
        .concat([epidemic])
        .concat(cards.slice(42, 53));

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.player_cards_draw).toEqual(expected)
    });

    it("should insert epidemics into player cards (3 players, 4 epidemics) -- middle", function() {
      randy.randInt = function(min, max) { return Math.floor((min + max) / 2); }
      spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz", "hi7H9"],
        { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.randInt.calls.length).toBe(4);

      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 9 + 5)
        .concat([epidemic])
        .concat(cards.slice(9 + 5, 20 + 5))
        .concat([epidemic])
        .concat(cards.slice(20 + 5, 31 + 5))
        .concat([epidemic])
        .concat(cards.slice(31 + 5, 42 + 5))
        .concat([epidemic])
        .concat(cards.slice(42 + 5, 53));

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.player_cards_draw).toEqual(expected)
    });

    it("should insert epidemics into player cards (3 players, 4 epidemics) -- end", function() {
      randy.randInt = function(min, max) { return max; }
      spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz", "hi7H9"],
        { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.randInt.calls.length).toBe(4);

      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 20)
        .concat([epidemic])
        .concat(cards.slice(20, 31))
        .concat([epidemic])
        .concat(cards.slice(31, 42))
        .concat([epidemic])
        .concat(cards.slice(42, 53))
        .concat([epidemic]);

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.player_cards_draw).toEqual(expected)
    });

    it("should insert epidemics into player cards (4 players, 6 epidemics)", function() {
      spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher", "Dispatcher"]);
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz", "hi7H9", "83ynY"],
        { "number_of_epidemics": 6 }, emitter, randy);
      game.setup();
      expect(randy.randInt.calls.length).toBe(6);

      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 4*2 = 8 player cards are reserved
      // The remaining 53 - 8 = 45 are divided into 6 piles: 8, 8, 8, 7, 7, 7
      var expected =
        cards.slice(0, 8)
        .concat([epidemic])
        .concat(cards.slice(8, 16))
        .concat([epidemic])
        .concat(cards.slice(16, 24))
        .concat([epidemic])
        .concat(cards.slice(24, 32))
        .concat([epidemic])
        .concat(cards.slice(32, 39))
        .concat([epidemic])
        .concat(cards.slice(39, 46))
        .concat([epidemic])
        .concat(cards.slice(46, 53));

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state.player_cards_draw).toEqual(expected)
    });

    it("should copy game definition to initial state", function() {
      var expectedState = _.clone(gameDef);
      expectedState.players = 
        [ { "id": "7aBf9", "role": "Medic" }, { "id": "UIyVz", "role": "Scientist" } ];
      expectedState.infection_cards_draw = _.clone(gameDef.infection_cards_draw).reverse();
      var epidemic = { "type": "epidemic" };
      var cards = _.clone(gameDef.player_cards_draw).reverse();
      expectedState.player_cards_draw =
        cards.slice(0, 8)
        .concat([epidemic])
        .concat(cards.slice(8, 20))
        .concat([epidemic])
        .concat(cards.slice(20, 31))
        .concat([epidemic])
        .concat(cards.slice(31, 42))
        .concat([epidemic])
        .concat(cards.slice(42, 53));

      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.name).toEqual("initial_state");
      expect(firstEvent.state).toEqual(expectedState);
    });
  });

});
