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

  function expectDraw(player, card) {
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "draw_player_card",
      "player": player,
      "card": card
    });
  }

  function disease(name) {
    return _.find(gameDef.locations,
      function(location) { return location.name == name; })
      .disease;
  }

  function expectInfection(card, number) {
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "draw_and_discard_infection_card",
      "card": card
    });
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "infect",
      "location": card.location,
      "disease": disease(card.location),
      "number": number
    });
  }
  
  describe(".setup()", function() {
    it("should assign roles, locations, hands", function() {
      spyOn(randy, "sample").andCallThrough();
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.players).toEqual(
          [
            { "id": "7aBf9", "role": "Medic", "location": "Atlanta", "hand": [] },
            { "id": "UIyVz", "role": "Scientist", "location": "Atlanta", "hand": [] }
          ]);
    });

    it("should shuffle infection cards", function() {
      spyOn(randy, "shuffle").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(randy.shuffle).toHaveBeenCalledWith(gameDef.infection_cards_draw);
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.infection_cards_draw).toEqual(
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
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
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
    });

    it("should set the initial state and research centers", function() {
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.state).toEqual({ "name": "setup", "terminal": false });
      expect(firstEvent.situation.research_centers).toEqual([ { "location": "Atlanta" } ]);
      expect(firstEvent.situation.research_centers_available).toBe(5);
    });

    it("should copy game definition and settings to initial state", function() {
      var expectedState = _.clone(gameDef);
      expectedState.players = [
          { "id": "7aBf9", "role": "Medic", "location": "Atlanta", "hand": [] },
          { "id": "UIyVz", "role": "Scientist", "location": "Atlanta", "hand": [] } ];
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
      expectedState.state = { "name": "setup", "terminal": false };
      expectedState.number_of_epidemics = 4;
      expectedState.research_centers = [{ "location": "Atlanta" }];
      expectedState.research_centers_available = 5;

      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation).toEqual(expectedState);
    });

    it("should carry out initial infections", function() {
      spyOn(emitter, "emit");
      var game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();

      var cards = _.clone(gameDef.infection_cards_draw).reverse();

      expectInfection(cards[0], 3);
      expectInfection(cards[1], 3);
      expectInfection(cards[2], 3);
      expectInfection(cards[3], 2);
      expectInfection(cards[4], 2);
      expectInfection(cards[5], 2);
      expectInfection(cards[6], 1);
      expectInfection(cards[7], 1);
      expectInfection(cards[8], 1);
    });

    it("should deal initial cards to players", function() {
      spyOn(emitter, "emit");
      var players = ["7aBf9", "UIyVz", "xiv9U"];
      var game = new Game(gameDef, players, { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();

      var cards = _.clone(gameDef.player_cards_draw).reverse();

      expectDraw(players[0], cards[0]);
      expectDraw(players[1], cards[1]);
      expectDraw(players[2], cards[2]);
      expectDraw(players[0], cards[3]);
      expectDraw(players[1], cards[4]);
      expectDraw(players[2], cards[5]);
      expectDraw(players[0], cards[6]);
      expectDraw(players[1], cards[7]);
      expectDraw(players[2], cards[8]);
    });

    it("should give the first player a turn", function() {
      spyOn(emitter, "emit");
      var players = ["7aBf9", "UIyVz", "xiv9U"];
      var game = new Game(gameDef, players, { "number_of_epidemics": 4 }, emitter, randy);
      game.setup();

      var lastCall = emitter.emit.calls[emitter.emit.calls.length - 1];
      expect(lastCall.args[0]).toEqual({
        "event_type": "state_change",
        "state": {
          "name": "player_actions",
          "player": "7aBf9",
          "actions_remaining": 4,
          "terminal": false
        }
      });
    });
  });

  describe(".act()", function() {
    var game;

    beforeEach(function() {
      randy.shuffle = function(arr) { return _.clone(arr); }
      game = new Game(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 }, emitter, randy);
    });

    function expectActions(player, remaining) {
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "player_actions",
          "player": player,
          "actions_remaining": remaining,
          "terminal": false
        }
      });
    }

    function expectDrawState(player, remaining) {
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "draw_player_cards",
          "player": player,
          "draws_remaining": remaining,
          "terminal": false
        }
      });
    }

    function expectInfectionState(player, remaining) {
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "draw_infection_cards",
          "player": player,
          "draws_remaining": remaining,
          "terminal": false
        }
      });
    }

    it("handles 'pass' by decrementing the actions", function() {
      game.setup();
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 3);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 2);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 1);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectDrawState("7aBf9", 2);
    });

    it("refuses 'pass' from other players", function() {
      game.setup();
      expect(game.act("UIyVz", { "name": "action_pass" })).toBeFalsy();
    });

    function skipTurnActions(player) {
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
    }

    it("refuses 'pass' when not in player_actions state", function() {
      game.setup();
      skipTurnActions("7aBf9");
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeFalsy();
    });

    it("enables players to draw cards when appropriate", function() {
      randy.randInt = function(min, max) { return max; }
      game.setup();

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeFalsy();
      skipTurnActions("7aBf9");
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("UIyVz", { "name": "draw_player_card" })).toBeFalsy();
      expect(emitter.emit).not.toHaveBeenCalled();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expectDraw("7aBf9", gameDef.player_cards_draw[8]);

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expectDraw("7aBf9", gameDef.player_cards_draw[9]);
      expectInfectionState("7aBf9", 2);
    });

    it("handles epidemics appropriately", function() {
      var nInfections = gameDef.infection_cards_draw.length;
      game.setup();
      skipTurnActions("7aBf9");

      // Drawing an epidemic
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expectDraw("7aBf9", { "type": "epidemic" });
      //  - triggers increased infection rate
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "infection_rate_increased"
      });
      //  - triggers an infection from the bottom infection card
      expectInfection(gameDef.infection_cards_draw[nInfections - 1], 3);
      //  - triggers the "epidemic" state
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": { "name": "epidemic" }
      });

      // No cards can be drawn in the epidemic state
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeFalsy();

      // Other players can not end the epidemic state
      expect(game.act("UIyVz", { "name": "increase_infection_intensity" })).toBeFalsy();

      // At the end of the epidemic state, "increase infection intensity" 
      randy.shuffle = function(x) { return _.clone(x).reverse(); }
      spyOn(randy, "shuffle").andCallThrough();
      var discarded =
        gameDef.infection_cards_draw.slice(0,9).concat(
          gameDef.infection_cards_draw.slice(nInfections - 1, nInfections)
        ).reverse();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(randy.shuffle).toHaveBeenCalledWith(discarded);
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "infection_cards_restack",
        "cards": _.clone(discarded).reverse()
      });

      // Then transition back to drawing player cards
      expectDrawState("7aBf9", 1);
    });
  });
});
