var Game = require("../game");
var initializeGame = require("../initializeGame");
var _ = require("underscore");
var fs = require("fs");

var defaultGameDef = require('../defaultGameDef');
var Replay = require('../replay');

describe("Game", function() {
  var gameDef;
  var randy;
  var emitter;
  var replay;

  beforeEach(function() {
    gameDef = initializeGame(defaultGameDef);
    randy = {
      sample: function(population, count) { return ["Medic", "Scientist"]; },
      shuffle: function(arr) { return _.clone(arr).reverse(); },
      randInt: function(min, max) { return min; }
    };
    replay = new Replay();
    emitter = {
      emit: function(e) { replay.receive(e); }
    };
  });

  function expectDraw(player, card) {
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "draw_player_card",
      "player": player,
      "card": card
    });
  }

  function findLocation(name) {
    return _.find(gameDef.locations,
      function(location) { return location.name == name; });
  }

  function findDisease(name) {
    return findLocation(name).disease;
  }

  function expectOutbreak(location, disease) {
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "outbreak",
      "location": location,
      "disease": disease
    });
  }

  function expectInfection(location, disease, number) {
    var event = {
      "event_type": "infect",
      "location": location,
      "disease": disease
    };
    var events = _.filter(emitter.emit.calls, function(call) {
      return _.isEqual(call.args[0], event);
    });
    expect(events.length).toBe(number);
  }

  function expectDrawInfection(card, number) {
    expect(emitter.emit).toHaveBeenCalledWith({
      "event_type": "draw_and_discard_infection_card",
      "card": card
    });
    expectInfection(card.location, findDisease(card.location), number);
  }

  function expectReplayMatch(game) {
    expect(game.situation).toEqual(replay.situation);
  }
  
  describe(".setup()", function() {
    it("should assign roles, locations, hands", function() {
      spyOn(randy, "sample").andCallThrough();
      spyOn(emitter, "emit").andCallThrough();
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
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
      expectReplayMatch(game);
    });

    it("should shuffle infection cards", function() {
      spyOn(randy, "shuffle").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
      expect(randy.shuffle).toHaveBeenCalledWith(gameDef.infection_cards_draw);
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.infection_cards_draw).toEqual(
        _.clone(gameDef.infection_cards_draw).reverse());
    });

    it("should shuffle player cards", function() {
      spyOn(randy, "shuffle").andCallThrough();
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
      expect(randy.shuffle).toHaveBeenCalledWith(gameDef.player_cards_draw);
    });

    it("should insert epidemics into player cards (2 players, 4 epidemics)", function() {
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
      expect(randy.randInt.calls.length).toBe(4);

      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 2*4 = 8 player cards are reserved
      // The remaining 53 - 8 = 45 are divided into 4 piles: 12, 11, 11, 11
      var expected =
        cards.slice(0, 8)
        .concat([epidemic(0)])
        .concat(cards.slice(8, 20))
        .concat([epidemic(1)])
        .concat(cards.slice(20, 31))
        .concat([epidemic(2)])
        .concat(cards.slice(31, 42))
        .concat([epidemic(3)])
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
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz", "hi7H9"], { "number_of_epidemics": 4 });
      expect(randy.randInt.calls.length).toBe(4);

      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 9)
        .concat([epidemic(0)])
        .concat(cards.slice(9, 20))
        .concat([epidemic(1)])
        .concat(cards.slice(20, 31))
        .concat([epidemic(2)])
        .concat(cards.slice(31, 42))
        .concat([epidemic(3)])
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
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz", "hi7H9"], { "number_of_epidemics": 4 });
      expect(randy.randInt.calls.length).toBe(4);

      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 9 + 5)
        .concat([epidemic(0)])
        .concat(cards.slice(9 + 5, 20 + 5))
        .concat([epidemic(1)])
        .concat(cards.slice(20 + 5, 31 + 5))
        .concat([epidemic(2)])
        .concat(cards.slice(31 + 5, 42 + 5))
        .concat([epidemic(3)])
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
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz", "hi7H9"], { "number_of_epidemics": 4 });
      expect(randy.randInt.calls.length).toBe(4);

      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 3*3 = 9 player cards are reserved
      // The remaining 53 - 9 = 44 are divided into 4 piles: 11, 11, 11, 11
      var expected =
        cards.slice(0, 20)
        .concat([epidemic(0)])
        .concat(cards.slice(20, 31))
        .concat([epidemic(1)])
        .concat(cards.slice(31, 42))
        .concat([epidemic(2)])
        .concat(cards.slice(42, 53))
        .concat([epidemic(3)]);

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
    });

    it("should insert epidemics into player cards (4 players, 6 epidemics)", function() {
      spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher", "Dispatcher"]);
      spyOn(randy, "randInt").andCallThrough();
      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz", "hi7H9", "83ynY"], { "number_of_epidemics": 6 });
      expect(randy.randInt.calls.length).toBe(6);

      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();

      // Initially there are 48 + 5 = 53 player cards.
      // The first 4*2 = 8 player cards are reserved
      // The remaining 53 - 8 = 45 are divided into 6 piles: 8, 8, 8, 7, 7, 7
      var expected =
        cards.slice(0, 8)
        .concat([epidemic(0)])
        .concat(cards.slice(8, 16))
        .concat([epidemic(1)])
        .concat(cards.slice(16, 24))
        .concat([epidemic(2)])
        .concat(cards.slice(24, 32))
        .concat([epidemic(3)])
        .concat(cards.slice(32, 39))
        .concat([epidemic(4)])
        .concat(cards.slice(39, 46))
        .concat([epidemic(5)])
        .concat(cards.slice(46, 53));

      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation.player_cards_draw).toEqual(expected)
    });

    it("should set the initial state and research centers", function() {
      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
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
      function epidemic(n) { return { "type": "epidemic", "number": n }; }
      var cards = _.clone(gameDef.player_cards_draw).reverse();
      expectedState.player_cards_draw =
        cards.slice(0, 8)
        .concat([epidemic(0)])
        .concat(cards.slice(8, 20))
        .concat([epidemic(1)])
        .concat(cards.slice(20, 31))
        .concat([epidemic(2)])
        .concat(cards.slice(31, 42))
        .concat([epidemic(3)])
        .concat(cards.slice(42, 53));
      expectedState.state = { "name": "setup", "terminal": false };
      expectedState.number_of_epidemics = 4;
      expectedState.research_centers = [{ "location": "Atlanta" }];
      expectedState.research_centers_available = 5;

      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
      expect(emitter.emit).toHaveBeenCalled();
      var firstEvent = emitter.emit.calls[0].args[0];
      expect(firstEvent.event_type).toEqual("initial_situation");
      expect(firstEvent.situation).toEqual(expectedState);
    });

    it("should carry out initial infections", function() {
      spyOn(emitter, "emit");
      var game = new Game(emitter, randy);
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });

      var cards = _.clone(gameDef.infection_cards_draw).reverse();

      expectDrawInfection(cards[0], 3);
      expectDrawInfection(cards[1], 3);
      expectDrawInfection(cards[2], 3);
      expectDrawInfection(cards[3], 2);
      expectDrawInfection(cards[4], 2);
      expectDrawInfection(cards[5], 2);
      expectDrawInfection(cards[6], 1);
      expectDrawInfection(cards[7], 1);
      expectDrawInfection(cards[8], 1);
    });

    it("should deal initial cards to players", function() {
      spyOn(emitter, "emit");
      var players = ["7aBf9", "UIyVz", "xiv9U"];
      var game = new Game(emitter, randy);
      game.setup(gameDef, players, { "number_of_epidemics": 4 });

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
      var game = new Game(emitter, randy);
      game.setup(gameDef, players, { "number_of_epidemics": 4 });

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
      game = new Game(emitter, randy);
    });

    function gameSetup() {
      game.setup(gameDef, ["7aBf9", "UIyVz"], { "number_of_epidemics": 4 });
    }

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
      gameSetup();
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 3);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 2);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectActions("7aBf9", 1);
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeTruthy();
      expectDrawState("7aBf9", 2);
      expectReplayMatch(game);
    });

    it("refuses 'pass' from other players", function() {
      gameSetup();
      expect(game.act("UIyVz", { "name": "action_pass" })).toBeFalsy();
    });

    function skipTurnActions(player) {
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
      expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
    }

    it("refuses 'pass' when not in player_actions state", function() {
      gameSetup();
      skipTurnActions("7aBf9");
      expect(game.act("7aBf9", { "name": "action_pass" })).toBeFalsy();
    });

    it("enables players to draw cards when appropriate", function() {
      randy.randInt = function(min, max) { return max; }
      gameSetup();

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

      expectReplayMatch(game);
    });

    it("handles epidemics appropriately", function() {
      var nInfections = gameDef.infection_cards_draw.length;
      gameSetup();
      skipTurnActions("7aBf9");

      // Drawing an epidemic
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expectDraw("7aBf9", { "type": "epidemic", "number": 0 });
      //  - triggers increased infection rate
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "infection_rate_increased"
      });
      //  - triggers an infection from the bottom infection card
      expectDrawInfection(gameDef.infection_cards_draw[nInfections - 1], 3);
      //  - triggers the "epidemic" state
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "epidemic",
          "player": "7aBf9",
          "parent": {
            "name": "draw_player_cards",
            "player": "7aBf9",
            "draws_remaining": 1,
            "terminal": false
          },
          "terminal": false
        }
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

      expectReplayMatch(game);
    });

    it("transitions to infection directly after epidemic on second draw", function() {
      var nInfections = gameDef.infection_cards_draw.length;
      randy.randInt = function(min, max) { return min + 1 };
      gameSetup();
      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      // Drawing an epidemic
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expectDraw("7aBf9", { "type": "epidemic", "number": 0 });
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expectInfectionState("7aBf9", 2);

      expectReplayMatch(game);
    });

    it("handles infection", function() {
      gameSetup();

      randy.shuffle = function(arr) {
        return arr.slice(1, arr.length).concat(arr.slice(0, 1));
      };

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      expectDrawInfection(gameDef.infection_cards_draw[8], 1);
      expectInfectionState("7aBf9", 1);

      expectReplayMatch(game);
    });

    it("handles outbreaks", function() {
      var nInfections = gameDef.infection_cards_draw.length;
      gameSetup();
      randy.shuffle = function(x) { return _.clone(x); }

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      var origin = gameDef.infection_cards_draw[nInfections - 1].location;
      var disease = findDisease(origin);
      expectOutbreak(origin, disease);

      // The rest of the test specific for the test data
      // Some sanity asserts here
      expect(origin).toBe("Kinshasa"); 
      expect(disease).toBe("Yellow");
      expectInfection("Lagos", disease, 1);
      expectInfection("Johannesburg", disease, 1);
      expectInfection("Khartoum", disease, 1);
      expectInfectionState("7aBf9", 1);

      expectReplayMatch(game);
    });

    it("handles chain reactions", function() {
      _.each(gameDef.diseases, function(disease) {
        disease.cubes = 1000;
      });
      var nInfections = gameDef.infection_cards_draw.length;
      gameSetup();
      randy.shuffle = function(x) { return _.clone(x).reverse(); }

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();

      // Starting situation:
      // 3: San Francisco, Chicago, Toronto
      // 2: Atlanta, New York, Washington DC
      // 1: London, Madrid, Essen

      var events = _.map(emitter.emit.calls, function(call) {
        return call.args[0];
      });
      var expectedEvents = [
        { "event_type": "draw_and_discard_infection_card",
          "card": gameDef.infection_cards_draw[0] },
        { "event_type": "outbreak",
          "location": "San Francisco",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Tokyo",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Manila",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Los Angeles",
          "disease": "Blue" },
        { "event_type": "outbreak",
          "location": "Chicago",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Los Angeles",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Mexico City",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Atlanta",
          "disease": "Blue" },
        { "event_type": "outbreak",
          "location": "Toronto",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "Washington DC",
          "disease": "Blue" },
        { "event_type": "infect",
          "location": "New York",
          "disease": "Blue" },
        { "event_type": "state_change",
          "state": {
            "name": "draw_infection_cards",
            "player": "7aBf9",
            "draws_remaining": 1,
            "terminal": false
          }
        }];

      _.each(expectedEvents, function(expectedEvent) {
        expect(events).toContain(expectedEvent);
        var event = _.find(events, function(e) { return _.isEqual(e, expectedEvent); });
        events.splice(_.indexOf(events, event), 1);
      });
      expect(events).toEqual([]);
      
      // Current situation: 3 outbreaks
      // 3: San Francisco, Chicago, Toronto, Atlanta, New York, Washington DC
      // 2: Los Angeles
      // 1: London, Madrid, Essen, Tokyo, Manila, Mexico City

      expectReplayMatch(game);
    });

    it("detects defeat by too many outbreaks", function() {
      _.each(gameDef.diseases, function(disease) {
        disease.cubes = 1000;
      });
      var nInfections = gameDef.infection_cards_draw.length;
      gameSetup();
      randy.shuffle = function(x) { return _.clone(x).reverse(); }

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, "emit").andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      // Current situation: 3 outbreaks
      // 3: San Francisco, Chicago, Toronto, Atlanta, New York, Washington DC
      // 2: Los Angeles
      // 1: London, Madrid, Essen, Tokyo, Manila, Mexico City
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "defeat_too_many_outbreaks",
          "terminal": true
        }
      });

      var outbreaks = _.filter(emitter.emit.calls, function(call) {
        return call.args[0].event_type === "outbreak";
      });
      expect(outbreaks.length).toBe(8);

      expectReplayMatch(game);
    });

    it("detects defeat by too many infections", function() {
      var nInfections = gameDef.infection_cards_draw.length;
      gameSetup();
      randy.shuffle = function(x) { return _.clone(x).reverse(); }

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "increase_infection_intensity" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();

      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "defeat_too_many_infections",
          "disease": "Blue",
          "terminal": true
        }
      });

      var infections = _.filter(emitter.emit.calls, function(call) {
        return call.args[0].event_type === "infect";
      });
      expect(infections.length).toBe(6);

      expectReplayMatch(game);
    });

    it("gives the turn to the next player", function() {
      randy.randInt = function(min, max) { return max; }
      gameSetup();

      skipTurnActions("7aBf9");

      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();

      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "player_actions",
          "player": "UIyVz",
          "actions_remaining": 4,
          "terminal": false
        }
      });

      expectReplayMatch(game);
    });

    it("gives the turn back to the first player", function() {
      randy.randInt = function(min, max) { return max; }
      gameSetup();

      skipTurnActions("7aBf9");
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();
      expect(game.act("7aBf9", { "name": "draw_infection_card" })).toBeTruthy();

      skipTurnActions("UIyVz");
      expect(game.act("UIyVz", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("UIyVz", { "name": "draw_player_card" })).toBeTruthy();
      expect(game.act("UIyVz", { "name": "draw_infection_card" })).toBeTruthy();
      spyOn(emitter, 'emit').andCallThrough();
      expect(game.act("UIyVz", { "name": "draw_infection_card" })).toBeTruthy();

      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "state_change",
        "state": {
          "name": "player_actions",
          "player": "7aBf9",
          "actions_remaining": 4,
          "terminal": false
        }
      });

      expectReplayMatch(game);
    });

    function expectMove(player, location) {
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "move_pawn",
        "player": player,
        "location": location
      });
    }

    function expectTreatment(location, disease, number) {
      expect(emitter.emit).toHaveBeenCalledWith({
        "event_type": "treat_disease",
        "location": location,
        "disease": disease,
        "number": number
      });
    }

    describe('drive', function() {
      it('allows to move to an adjacent location', function() {
        gameSetup();
        spyOn(emitter, 'emit').andCallThrough();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Washington DC"})).toBeTruthy();
        expectActions("7aBf9", 3);
        expectMove("7aBf9", "Washington DC");
        expectReplayMatch(game);
      });

      it('refuses to move to a non-adjacent location', function() {
        gameSetup();
        spyOn(emitter, 'emit').andCallThrough();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Algiers"})).toBeFalsy();
        expect(emitter.emit).not.toHaveBeenCalled();
        expectReplayMatch(game);
      });

      it('tracks the updated location', function() {
        gameSetup();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Washington DC"})).toBeTruthy();
        spyOn(emitter, 'emit').andCallThrough();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "New York"})).toBeTruthy();
        expectActions("7aBf9", 2);
        expectMove("7aBf9", "New York");
        expectReplayMatch(game);
      });
    });

    describe('treat_disease', function() {
      it('allows to remove a cube from the current location', function() {
        randy.sample = function(population, count) { return ["Researcher", "Scientist"]; },
        gameSetup();
        spyOn(emitter, 'emit').andCallThrough();
        expect(game.act("7aBf9", { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
        expectActions("7aBf9", 3);
        expectTreatment("Atlanta", "Blue", 1);
        expectReplayMatch(game);
      });

      it('refuses to treat non-present disease', function() {
        randy.sample = function(population, count) { return ["Researcher", "Scientist"]; },
        gameSetup();
        spyOn(emitter, 'emit').andCallThrough();
        expect(game.act("7aBf9", { "name": "action_treat_disease", "disease": "Red"})).toBeFalsy();
        expect(emitter.emit).not.toHaveBeenCalled();
        expectReplayMatch(game);
      });

      it('treats until all cubes are gone', function() {
        randy.sample = function(population, count) { return ["Researcher", "Scientist"]; },
        gameSetup();
        expect(game.act("7aBf9", { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
        expect(game.act("7aBf9", { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
        expect(game.act("7aBf9", { "name": "action_treat_disease", "disease": "Blue"})).toBeFalsy();
        expectReplayMatch(game);
      });
    });

    describe('build-research-center', function() {
      it('allows to build a research center', function() {
        gameSetup();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Chicago" })).toBeTruthy();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Toronto" })).toBeTruthy();
        spyOn(emitter, "emit").andCallThrough();
        expect(game.act("7aBf9", { "name": "action_build_research_center" })).toBeTruthy();
        expectActions("7aBf9", 1);
        expect(emitter.emit).toHaveBeenCalledWith({
          "event_type": "discard_player_card",
          "player": "7aBf9",
          "card": {
            "type": "location",
            "location": "Toronto"
          }
        });
        expect(emitter.emit).toHaveBeenCalledWith({
          "event_type": "build_research_center",
          "location": "Toronto"
        });
        expectReplayMatch(game);
      });

      it('refuses to build a research center without the card', function() {
        gameSetup();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Chicago" })).toBeTruthy();
        spyOn(emitter, "emit").andCallThrough();
        expect(game.act("7aBf9", { "name": "action_build_research_center" })).toBeFalsy();
        expect(emitter.emit).not.toHaveBeenCalled();
        expectReplayMatch(game);
      });

      it('stops building research centers when they run out', function() {
        gameDef.research_centers_available = 1;
        gameSetup();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Chicago" })).toBeTruthy();
        expect(game.act("7aBf9", { "name": "action_drive", "location": "Toronto" })).toBeTruthy();
        spyOn(emitter, "emit").andCallThrough();
        expect(game.act("7aBf9", { "name": "action_build_research_center" })).toBeFalsy();
        expect(emitter.emit).not.toHaveBeenCalled();
        expectReplayMatch(game);
      });

      it('refuses to build a research center when it already exists', function() {
        var cards = gameDef.player_cards_draw;
        gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
        console.log(gameDef.player_cards_draw);
        gameSetup();
        spyOn(emitter, "emit").andCallThrough();
        expect(game.act("7aBf9", { "name": "action_build_research_center" })).toBeFalsy();
        expect(emitter.emit).not.toHaveBeenCalled();
        expectReplayMatch(game);
      });
    });
  });
});
