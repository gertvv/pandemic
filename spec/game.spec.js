/*global describe, beforeEach, afterEach, it, expect*/
var Game = require("../game");
var initializeGame = require("../initializeGame");
var _ = require("underscore");
var fs = require("fs");

var defaultGameDef = require('../defaultGameDef');
var Replay = require('../replay');

describe("Game", function () {
    "use strict";
    var gameDef, randy, emitter, replay;

    beforeEach(function () {
        gameDef = initializeGame(defaultGameDef);
        randy = {
            sample: function (population, count) {
                count = count + 1;  // Silence linter
                population = population + 1;  // Silence linter
                return ["Medic", "Scientist"];
            },
            shuffle: function (arr) {
                return _.clone(arr).reverse();
            },
            randInt: function (min, max) {
                max = max + 1;  // Silence linter
                return min;
            }
        };
        replay = new Replay();
        emitter = {
            emit: function (e) { replay.receive(e); }
        };
    });

    function expectDraw(player, card) {
        expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "draw_player_card",
            "player": player,
            "card": card
        });
    }

    function expectDiscard(player, card) {
        expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "discard_player_card",
            "player": player,
            "card": card
        });
    }

    function findLocation(name) {
        return _.find(gameDef.locations,
            function (location) { return location.name === name; });
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
        },
            events = _.filter(emitter.emit.calls, function (call) {
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

    // we expect the emitter to be spied on
    function testActionRequiringApproval(game, player, action, other) {
        var state = game.situation.state,
            request = {
                "event_type": "state_change",
                "state": {
                    "name": "approve_action",
                    "player": player,
                    "approve_player": other,
                    "approve_action": action,
                    "parent": state,
                    "terminal": false
                }
            };

        // First try the action and refuse
        emitter.emit.reset();
        expect(game.act(player, action)).toBeTruthy();
        expect(emitter.emit).toHaveBeenCalledWith(request);
        expect(emitter.emit.callCount).toBe(1);
        emitter.emit.reset();
        expect(game.act(player, { "name": "refuse_action" })).toBeFalsy();
        expect(game.act(other, { "name": "refuse_action" })).toBeTruthy();
        expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": state
        });
        expect(emitter.emit.callCount).toBe(1);

        // Now try the action and approve it
        emitter.emit.reset();
        expect(game.act(player, action)).toBeTruthy();
        expect(emitter.emit).toHaveBeenCalledWith(request);
        expect(emitter.emit.callCount).toBe(1);
        emitter.emit.reset();
        expect(game.act(player, { "name": "approve_action" })).toBeFalsy();
        expect(game.act(other, { "name": "approve_action" })).toBeTruthy();
    }

    var player1 = "7aBf9";
    var player2 = "UIyVz";
    
    describe(".setup()", function () {
        it("should assign roles, locations, hands", function () {
            spyOn(randy, "sample").andCallThrough();
            spyOn(emitter, "emit").andCallThrough();
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
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
                { "id": player1, "role": "Medic", "location": "Atlanta", "hand": [] },
                { "id": player2, "role": "Scientist", "location": "Atlanta", "hand": [] }
                ]);
            expectReplayMatch(game);
        });

        it("should shuffle infection cards", function () {
            spyOn(randy, "shuffle").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
            expect(randy.shuffle).toHaveBeenCalledWith(gameDef.infection_cards_draw);
            expect(emitter.emit).toHaveBeenCalled();
            var firstEvent = emitter.emit.calls[0].args[0];
            expect(firstEvent.event_type).toEqual("initial_situation");
            expect(firstEvent.situation.infection_cards_draw).toEqual(
            _.clone(gameDef.infection_cards_draw).reverse());
        });

        it("should shuffle player cards", function () {
            spyOn(randy, "shuffle").andCallThrough();
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
            expect(randy.shuffle).toHaveBeenCalledWith(gameDef.player_cards_draw);
        });

        it("should insert epidemics into player cards (2 players, 4 epidemics)", function () {
            spyOn(randy, "randInt").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
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

        it("should insert epidemics into player cards (3 players, 4 epidemics)", function () {
            spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
            spyOn(randy, "randInt").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2, "hi7H9"], { "number_of_epidemics": 4 });
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

        it("should insert epidemics into player cards (3 players, 4 epidemics) -- middle", function () {
            randy.randInt = function (min, max) { return Math.floor((min + max) / 2); }
            spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
            spyOn(randy, "randInt").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2, "hi7H9"], { "number_of_epidemics": 4 });
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

        it("should insert epidemics into player cards (3 players, 4 epidemics) -- end", function () {
            randy.randInt = function (min, max) { return max; }
            spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher"]);
            spyOn(randy, "randInt").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2, "hi7H9"], { "number_of_epidemics": 4 });
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

        it("should insert epidemics into player cards (4 players, 6 epidemics)", function () {
            spyOn(randy, "sample").andReturn(["Medic", "Scientist", "Researcher", "Dispatcher"]);
            spyOn(randy, "randInt").andCallThrough();
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2, "hi7H9", "83ynY"], { "number_of_epidemics": 6 });
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

        it("should set the initial state and research centers", function () {
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
            expect(emitter.emit).toHaveBeenCalled();
            var firstEvent = emitter.emit.calls[0].args[0];
            expect(firstEvent.event_type).toEqual("initial_situation");
            expect(firstEvent.situation.state).toEqual({ "name": "setup", "terminal": false });
            expect(firstEvent.situation.research_centers).toEqual([ { "location": "Atlanta" } ]);
            expect(firstEvent.situation.research_centers_available).toBe(5);
        });

        it("should copy game definition and settings to initial state", function () {
            var expectedState = _.clone(gameDef);
            expectedState.players = [
                { "id": player1, "role": "Medic", "location": "Atlanta", "hand": [] },
                { "id": player2, "role": "Scientist", "location": "Atlanta", "hand": [] } ];
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
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
            expect(emitter.emit).toHaveBeenCalled();
            var firstEvent = emitter.emit.calls[0].args[0];
            expect(firstEvent.event_type).toEqual("initial_situation");
            expect(firstEvent.situation).toEqual(expectedState);
        });

        it("should carry out initial infections", function () {
            spyOn(emitter, "emit");
            var game = new Game(emitter, randy);
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });

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

        it("should deal initial cards to players", function () {
            spyOn(emitter, "emit");
            var players = [player1, player2, "xiv9U"];
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

        it("should give the first player a turn", function () {
            spyOn(emitter, "emit");
            var players = [player1, player2, "xiv9U"];
            var game = new Game(emitter, randy);
            game.setup(gameDef, players, { "number_of_epidemics": 4 });

            var lastCall = emitter.emit.calls[emitter.emit.calls.length - 1];
            expect(lastCall.args[0]).toEqual({
            "event_type": "state_change",
            "state": {
                "name": "player_actions",
                "player": player1,
                "actions_remaining": 4,
                "terminal": false
            }
            });
        });
    }); // .setup()

    describe(".act()", function () {
        var game;

        beforeEach(function () {
            randy.shuffle = function (arr) { return _.clone(arr); }
            game = new Game(emitter, randy);
        });

        function gameSetup() {
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 4 });
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

        it("handles 'pass' by decrementing the actions", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expectActions(player1, 3);
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expectActions(player1, 2);
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expectActions(player1, 1);
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expectDrawState(player1, 2);
            expectReplayMatch(game);
        });

        it("refuses 'pass' from other players", function () {
            gameSetup();
            expect(game.act(player2, { "name": "action_pass" })).toBeFalsy();
        });

        function skipTurnActions(player) {
            expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player, { "name": "action_pass" })).toBeTruthy();
        }

        it("refuses 'pass' when not in player_actions state", function () {
            gameSetup();
            skipTurnActions(player1);
            expect(game.act(player1, { "name": "action_pass" })).toBeFalsy();
        });

        it("enables players to draw cards when appropriate", function () {
            randy.randInt = function (min, max) { return max; }
            gameSetup();

            expect(game.act(player1, { "name": "draw_player_card" })).toBeFalsy();
            skipTurnActions(player1);
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "draw_player_card" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, gameDef.player_cards_draw[8]);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, gameDef.player_cards_draw[9]);
            expectInfectionState(player1, 2);

            expectReplayMatch(game);
        });

        describe("discard_player_card", function () {
            it("allows the active player to discard a card", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "discard_player_card", "card": gameDef.player_cards_draw[0] })).toBeTruthy();
            expectDiscard(player1, gameDef.player_cards_draw[0]);
            expectReplayMatch(game);
            });

            it("allows other players to discard card a card", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "discard_player_card", "card": gameDef.player_cards_draw[1] })).toBeTruthy();
            expectDiscard(player2, gameDef.player_cards_draw[1]);
            expectReplayMatch(game);
            });

            it("does not allow discarding cards that are not held", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "discard_player_card", "card": gameDef.player_cards_draw[1] })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("does not allow the same card to be discarded twice", function () {
            gameSetup();
            expect(game.act(player1, { "name": "discard_player_card", "card": gameDef.player_cards_draw[0] })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "discard_player_card", "card": gameDef.player_cards_draw[0] })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("allows discarding during draw_player_cards phase", function () {
            gameSetup();
            skipTurnActions(player1);
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "discard_player_card", "card": gameDef.player_cards_draw[1] })).toBeTruthy();
            expectDiscard(player2, gameDef.player_cards_draw[1]);
            expectReplayMatch(game);
            });

            it("allows discarding during draw_infection_cards phase", function () {
            randy.randInt = function (min, max) { return max; }
            gameSetup();
            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "discard_player_card", "card": gameDef.player_cards_draw[1] })).toBeTruthy();
            expectDiscard(player2, gameDef.player_cards_draw[1]);
            expectReplayMatch(game);
            });
        });

        it("forces players to discard cards when hand limit exceeded", function () {
            gameDef.max_player_cards = 5;
            randy.randInt = function (min, max) { return max; }
            gameSetup();

            skipTurnActions(player1);
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, gameDef.player_cards_draw[8]);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, gameDef.player_cards_draw[9]);
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "hand_limit_exceeded",
                "player": player1,
                "parent": {
                "name": "draw_player_cards",
                "player": player1,
                "draws_remaining": 0,
                "terminal": false
                },
                "terminal": false
            }
            });
            expect(game.act(player1, { "name": "discard_player_card", "card": gameDef.player_cards_draw[9] })).toBeTruthy();
            expectInfectionState(player1, 2);

            expectReplayMatch(game);
        });

        it("handles epidemics appropriately", function () {
            var nInfections = gameDef.infection_cards_draw.length;
            gameSetup();
            skipTurnActions(player1);

            // Drawing an epidemic
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, { "type": "epidemic", "number": 0 });
            //    - triggers increased infection rate
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "infection_rate_increased"
            });
            //    - triggers an infection from the bottom infection card
            expectDrawInfection(gameDef.infection_cards_draw[nInfections - 1], 3);
            //    - triggers the "epidemic" state
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "epidemic",
                "player": player1,
                "parent": {
                "name": "draw_player_cards",
                "player": player1,
                "draws_remaining": 1,
                "terminal": false
                },
                "terminal": false
            }
            });

            // No cards can be drawn in the epidemic state
            expect(game.act(player1, { "name": "draw_player_card" })).toBeFalsy();

            // Other players can not end the epidemic state
            expect(game.act(player2, { "name": "increase_infection_intensity" })).toBeFalsy();

            // At the end of the epidemic state, "increase infection intensity" 
            randy.shuffle = function (x) { return _.clone(x).reverse(); }
            spyOn(randy, "shuffle").andCallThrough();
            var discarded =
            gameDef.infection_cards_draw.slice(0,9).concat(
                gameDef.infection_cards_draw.slice(nInfections - 1, nInfections)
            ).reverse();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(randy.shuffle).toHaveBeenCalledWith(discarded);
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "infection_cards_restack",
            "cards": _.clone(discarded).reverse()
            });

            // Then transition back to drawing player cards
            expectDrawState(player1, 1);

            expectReplayMatch(game);
        });

        it("transitions to infection directly after epidemic on second draw", function () {
            var nInfections = gameDef.infection_cards_draw.length;
            randy.randInt = function (min, max) { return min + 1 };
            gameSetup();
            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            // Drawing an epidemic
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, { "type": "epidemic", "number": 0 });
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expectInfectionState(player1, 2);

            expectReplayMatch(game);
        });

        it("handles infection", function () {
            gameSetup();

            randy.shuffle = function (arr) {
            return arr.slice(1, arr.length).concat(arr.slice(0, 1));
            };

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expectDrawInfection(gameDef.infection_cards_draw[8], 1);
            expectInfectionState(player1, 1);

            expectReplayMatch(game);
        });

        it("handles outbreaks", function () {
            var nInfections = gameDef.infection_cards_draw.length;
            gameSetup();
            randy.shuffle = function (x) { return _.clone(x); }

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
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
            expectInfectionState(player1, 1);

            expectReplayMatch(game);
        });

        it("handles chain reactions", function () {
            _.each(gameDef.diseases, function (disease) {
            disease.cubes = 1000;
            });
            var nInfections = gameDef.infection_cards_draw.length;
            gameSetup();
            randy.shuffle = function (x) { return _.clone(x).reverse(); }

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            // Starting situation:
            // 3: San Francisco, Chicago, Toronto
            // 2: Atlanta, New York, Washington DC
            // 1: London, Madrid, Essen

            var events = _.map(emitter.emit.calls, function (call) {
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
                "player": player1,
                "draws_remaining": 1,
                "terminal": false
                }
            }];

            _.each(expectedEvents, function (expectedEvent) {
            expect(events).toContain(expectedEvent);
            var event = _.find(events, function (e) { return _.isEqual(e, expectedEvent); });
            events.splice(_.indexOf(events, event), 1);
            });
            expect(events).toEqual([]);
            
            // Current situation: 3 outbreaks
            // 3: San Francisco, Chicago, Toronto, Atlanta, New York, Washington DC
            // 2: Los Angeles
            // 1: London, Madrid, Essen, Tokyo, Manila, Mexico City

            expectReplayMatch(game);
        });

        it("detects defeat by too many outbreaks", function () {
            _.each(gameDef.diseases, function (disease) {
                disease.cubes = 1000;
            });
            var nInfections = gameDef.infection_cards_draw.length;
            gameSetup();
            randy.shuffle = function (x) { return _.clone(x).reverse(); }

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            // Current situation: 3 outbreaks
            // 3: San Francisco, Chicago, Toronto, Atlanta, New York, Washington DC
            // 2: Los Angeles
            // 1: London, Madrid, Essen, Tokyo, Manila, Mexico City
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "defeat_too_many_outbreaks",
                "terminal": true
            }
            });

            var outbreaks = _.filter(emitter.emit.calls, function (call) {
                return call.args[0].event_type === "outbreak";
            });
            expect(outbreaks.length).toBe(8);

            expectReplayMatch(game);
        });

        it("detects defeat by too many infections", function () {
            var nInfections = gameDef.infection_cards_draw.length;
            gameSetup();
            randy.shuffle = function (x) { return _.clone(x).reverse(); }

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "increase_infection_intensity" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "defeat_too_many_infections",
                "disease": "Blue",
                "terminal": true
            }
            });

            var infections = _.filter(emitter.emit.calls, function (call) {
            return call.args[0].event_type === "infect";
            });
            expect(infections.length).toBe(6);

            expectReplayMatch(game);
        });

        it("detects defeat by running out of player cards (1st draw)", function () {
            gameDef.player_cards_draw.length = 8;
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 0 });
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "defeat_out_of_player_cards",
                "terminal": true
            }
            });
            expect(emitter.emit.callCount).toBe(1);
            expectReplayMatch(game);
        });

        it("detects defeat by running out of player cards (2nd draw)", function () {
            gameDef.player_cards_draw.length = 9;
            game.setup(gameDef, [player1, player2], { "number_of_epidemics": 0 });

            skipTurnActions(player1);
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expectDraw(player1, { "type": "location", "location": "Essen" });
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "defeat_out_of_player_cards",
                "terminal": true
            }
            });
            expect(emitter.emit.callCount).toBe(2);
            expectReplayMatch(game);
        });

        it("gives the turn to the next player", function () {
            randy.randInt = function (min, max) { return max; }
            gameSetup();

            skipTurnActions(player1);

            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "player_actions",
                "player": player2,
                "actions_remaining": 4,
                "terminal": false
            }
            });

            expectReplayMatch(game);
        });

        it("gives the turn back to the first player", function () {
            randy.randInt = function (min, max) { return max; }
            gameSetup();

            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            skipTurnActions(player2);
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_infection_card" })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "draw_infection_card" })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
            "event_type": "state_change",
            "state": {
                "name": "player_actions",
                "player": player1,
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

        describe('drive', function () {
            it('allows to move to an adjacent location', function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Washington DC"})).toBeTruthy();
            expectActions(player1, 3);
            expectMove(player1, "Washington DC");
            expectReplayMatch(game);
            });

            it('refuses to move to a non-adjacent location', function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Algiers"})).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses to move another player', function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player2, "location": "Chicago"})).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('tracks the updated location', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Washington DC"})).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "New York"})).toBeTruthy();
            expectActions(player1, 2);
            expectMove(player1, "New York");
            expectReplayMatch(game);
            });
        });

        describe('drive [dispatcher]', function () {
            it('allows to move another player to an adjacent location', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();

            var action = {
                "name": "action_drive",
                "player": player2,
                "location": "Washington DC"
            };
            testActionRequiringApproval(game, player1, action, player2);

            expectActions(player1, 3);
            expectMove(player2, "Washington DC");
            expectReplayMatch(game);
            });

            it('refuses to move to a non-adjacent location', function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player2, "location": "Algiers"})).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('treat_disease', function () {
            it('allows to remove a cube from the current location', function () {
            randy.sample = function (population, count) { return ["Researcher", "Scientist"]; },
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
            expectActions(player1, 3);
            expectTreatment("Atlanta", "Blue", 1);
            expectReplayMatch(game);
            });

            it('refuses to treat non-present disease', function () {
            randy.sample = function (population, count) { return ["Researcher", "Scientist"]; },
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Red"})).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('treats until all cubes are gone', function () {
            randy.sample = function (population, count) { return ["Researcher", "Scientist"]; },
            gameSetup();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeFalsy();
            expectReplayMatch(game);
            });

            it('medic treats all cubes at once', function () {
            randy.sample = function (population, count) { return ["Medic", "Scientist"]; },
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
            expectTreatment("Atlanta", "Blue", 2);
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeFalsy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago"})).toBeTruthy();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue"})).toBeTruthy();
            expectTreatment("Chicago", "Blue", 3);
            expectReplayMatch(game);
            });
        });

        describe('build-research-center', function () {
            it('allows to build a research center', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Toronto" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeTruthy();
            expectActions(player1, 1);
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "discard_player_card",
                "player": player1,
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

            it('refuses to build a research center without the card', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('allows the operations expert to build a research center without the card', function () {
            randy.sample = function (arr) { return [ "Operations Expert", "Medic" ]; }
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeTruthy();
            expectActions(player1, 2);
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "build_research_center",
                "location": "Chicago"
            });
            expect(emitter.emit.calls.length).toBe(2);
            expectReplayMatch(game);
            });

            it('stops building research centers when they run out', function () {
            gameDef.research_centers_available = 1;
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Toronto" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses to build a research center when it already exists', function () {
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('charter_flight', function () {
            it('allows to charter a flight', function () {
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player1, "location": "Hong Kong" })).toBeTruthy();
            expectActions(player1, 3);
            expectDiscard(player1, { "type": "location", "location": "Atlanta" });
            expectMove(player1, "Hong Kong");
            expectReplayMatch(game);
            });

            it('refuses to move another player', function () {
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player2, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            });

            it('refuses a flight to the current location', function () {
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player1, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a ticket', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player1, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('charter_flight [dispatcher]', function () {
            it('allows to charter a flight', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            var action = {
                "name": "action_charter_flight",
                "player": player2,
                "location": "Hong Kong"
            };
            testActionRequiringApproval(game, player1, action, player2);
            expectActions(player1, 3);
            expectDiscard(player1, { "type": "location", "location": "Atlanta" });
            expectMove(player2, "Hong Kong");
            expectReplayMatch(game);
            });

            it('refuses a flight to the current location', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago"})).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player2, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a ticket', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_charter_flight", "player": player2, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('direct_flight', function () {
            it('allows a direct flight', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player1, "location": "Toronto" })).toBeTruthy();
            expectActions(player1, 3);
            expectDiscard(player1, { "type": "location", "location": "Toronto" });
            expectMove(player1, "Toronto");
            expectReplayMatch(game);
            });

            it('refuses to move another player', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player2, "location": "Toronto" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            });

            it('refuses a flight to the current location', function () {
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player1, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a ticket', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player1, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('direct_flight [dispatcher]', function () {
            it('allows a direct flight', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            var action = { "name": "action_direct_flight", "player": player2, "location": "Toronto" };
            testActionRequiringApproval(game, player1, action, player2);
            expectActions(player1, 3);
            expectDiscard(player1, { "type": "location", "location": "Toronto" });
            expectMove(player2, "Toronto");
            expectReplayMatch(game);
            });

            it('refuses a flight to the current location', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            var cards = gameDef.player_cards_draw;
            gameDef.player_cards_draw = cards.splice(3, 1).concat(cards);
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player2, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a ticket', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_direct_flight", "player": player2, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('shuttle_flight', function () {
            it('allows a shuttle flight', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player1, "location": "Atlanta" })).toBeTruthy();
            expectDrawState(player1, 2);
            expectMove(player1, "Atlanta");
            expect(emitter.emit.calls.length).toBe(2);
            expectReplayMatch(game);
            });

            it('refuses to move another player', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player2, "location": "San Francisco" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            });

            it('refuses a flight to the current location', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player1, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a destination research center', function () {
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player1, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a source research center', function () {
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player1, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('shuttle_flight [dispatcher]', function () {
            it('allows a shuttle flight', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_build_research_center" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            var action = { "name": "action_shuttle_flight", "player": player2, "location": "San Francisco" };
            testActionRequiringApproval(game, player1, action, player2);
            expectDrawState(player1, 2);
            expectMove(player2, "San Francisco");
            expect(emitter.emit.calls.length).toBe(2);
            expectReplayMatch(game);
            });

            it('refuses a flight to the current location', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player2, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a destination research center', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player2, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('refuses a flight without a source research center', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player2, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_shuttle_flight", "player": player2, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        });

        describe('converge [dispatcher]', function () {
            var player3 = "Aws0m";
            it('allows players to converge', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher", "Scientist"]; }
            game.setup(gameDef, [player1, player2, player3], { "number_of_epidemics": 4 });
            expect(game.act(player1, { "name": "action_drive", "player": player3, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player3, { "name": "approve_action" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player3, "location": "San Francisco" })).toBeTruthy();
            expect(game.act(player3, { "name": "approve_action" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            var action = { "name": "action_converge", "player": player2, "location": "San Francisco" };
            testActionRequiringApproval(game, player1, action, player2);
            expectActions(player1, 1);
            expectMove(player2, "San Francisco");
            expect(emitter.emit.calls.length).toBe(2);
            expectReplayMatch(game);
            });

            it('does not allow move to empty location', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher", "Scientist"]; }
            game.setup(gameDef, [player1, player2, player3], { "number_of_epidemics": 4 });
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_converge", "player": player3, "location": "San Francisco" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it('allows dispatcher to move himself without approval', function () {
            randy.sample = function (arr) { return ["Dispatcher", "Researcher", "Scientist"]; }
            game.setup(gameDef, [player1, player2, player3], { "number_of_epidemics": 4 });
            expect(game.act(player1, { "name": "action_drive", "player": player3, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player3, { "name": "approve_action" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_drive", "player": player3, "location": "San Francisco" })).toBeTruthy();
            expect(game.act(player3, { "name": "approve_action" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_converge", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expectActions(player1, 1);
            expectMove(player1, "San Francisco");
            expect(emitter.emit.calls.length).toBe(2);
            expectReplayMatch(game);
            });
        });

        describe("discover_cure", function () {
            function setupAndSkipTwoTurns() {
            randy.randInt = function (min, max) { return max; }
            randy.sample = function (arr) { return ["Dispatcher", "Researcher"]; }
            gameSetup();

            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            skipTurnActions(player2);
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_infection_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_infection_card" })).toBeTruthy();
            }

            it("allows to discover the cure with 5 cards", function () {
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" },
                { "type": "location", "location": "Paris" }
            ];
            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeTruthy();
            expectActions(player1, 3);
            _.each(cards, function (card) { expectDiscard(player1, card); });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "discover_cure",
                "disease": "Blue"
            });
            expect(game.act(player1, { "name": "action_treat_disease", disease: "Blue" })).toBeTruthy();
            expectActions(player1, 2);
            expectTreatment("Atlanta", "Blue", 2);
            expectReplayMatch(game);
            });

            it("allows the scientist to discover the cure with only 4 cards", function () {
            randy.sample = function (arr) { return [ "Scientist", "Researcher" ]; };
            gameSetup();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" }
            ];
            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeTruthy();
            expectActions(player1, 3);
            _.each(cards, function (card) { expectDiscard(player1, card); });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "discover_cure",
                "disease": "Blue"
            });
            expect(game.act(player1, { "name": "action_treat_disease", disease: "Blue" })).toBeTruthy();
            expectActions(player1, 2);
            expectTreatment("Atlanta", "Blue", 2);
            expectReplayMatch(game);
            });

            it("has the medic automatically treat disease", function () {
            randy.randInt = function (min, max) { return max; }
            randy.sample = function (arr) { return [ "Scientist", "Medic" ]; };
            gameSetup();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" }
            ];
            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeTruthy();
            expectActions(player1, 3);
            _.each(cards, function (card) { expectDiscard(player1, card); });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "discover_cure",
                "disease": "Blue"
            });
            expectTreatment("Atlanta", "Blue", 2);
            expect(game.act(player1, { "name": "action_treat_disease", disease: "Blue" })).toBeFalsy();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player1, { "name": "action_pass" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            expect(game.act(player2, { "name": "action_drive", "player": player2, "location": "Chicago" })).toBeTruthy();
            expectTreatment("Chicago", "Blue", 3);
            expect(game.act(player2, { "name": "action_drive", "player": player2, "location": "Toronto" })).toBeTruthy();
            expectTreatment("Toronto", "Blue", 3);
            expect(game.act(player2, { "name": "action_drive", "player": player2, "location": "Washington DC" })).toBeTruthy();
            expectTreatment("Washington DC", "Blue", 2);
            expect(game.act(player2, { "name": "action_charter_flight", "player": player2, "location": "St. Petersburg" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player2, { "name": "draw_infection_card" })).toBeTruthy();
            expectInfection("St. Petersburg", "Blue", 1);
            expectTreatment("St. Petersburg", "Blue", 1);

            expectReplayMatch(game);
            });

            it("checks the player owns the claimed cards", function () {
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" },
                { "type": "location", "location": "Atlanta" }
            ];

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();

            expectReplayMatch(game);
            });

            it("checks the number of cards", function () {
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" }
            ];

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();

            cards.push({ "type": "location", "location": "Essen" });
            cards.push({ "type": "location", "location": "Paris" });

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();

            expectReplayMatch(game);
            });

            it("checks the cards are for the right disease", function () {
            randy.shuffle = function (arr) {
                var res = _.clone(arr);
                var tmp = res[13];
                res[13] = res[0];
                res[0] = tmp;
                return res;
            };
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" },
                { "type": "location", "location": "Paris" },
                { "type": "location", "location": "Cairo" }
            ];

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();

            cards[4] = { "type": "location", "location": "Essen" };
            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeTruthy();
            });

            it("checks the disease has not yet been cured", function () {
            gameDef.diseases[0].status = "cure_discovered";
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" },
                { "type": "location", "location": "Paris" }
            ];

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            });

            it("checks the disease has not been eradicated", function () {
            gameDef.diseases[0].status = "eradicated";
            setupAndSkipTwoTurns();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" },
                { "type": "location", "location": "Paris" }
            ];

            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            });

            it("allows the disease to be eradicated", function () {
            gameDef.initial_infections = [ 3 ];
            randy.randInt = function (min, max) { return max; }
            randy.sample = function (arr) { return [ "Scientist", "Medic" ]; };
            gameSetup();

            spyOn(emitter, "emit").andCallThrough();
            var cards = [
                { "type": "location", "location": "San Francisco" },
                { "type": "location", "location": "Toronto" },
                { "type": "location", "location": "New York" },
                { "type": "location", "location": "London" }
            ];
            expect(game.act(player1, { "name": "action_discover_cure", cards: cards })).toBeTruthy();
            expectActions(player1, 3);
            _.each(cards, function (card) { expectDiscard(player1, card); });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "discover_cure",
                "disease": "Blue"
            });
            emitter.emit.reset();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expectActions(player1, 2);
            expectMove(player1, "Chicago");
            emitter.emit.reset();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expectActions(player1, 1);
            expectMove(player1, "San Francisco");
            emitter.emit.reset();
            expect(game.act(player1, { "name": "action_treat_disease", "disease": "Blue" })).toBeTruthy();
            expectTreatment("San Francisco", "Blue", 3);
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "eradicate_disease",
                "disease": "Blue"
            });
            expectDrawState(player1, 2);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            emitter.emit.reset();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "draw_and_discard_infection_card",
                "card": { "type": "location", "location": "Chicago" }
            });
            expectInfectionState(player1, 1);
            expect(emitter.emit.callCount).toBe(2); // no infections!

            expectReplayMatch(game);
            });

            it("enables victory by eradicating all diseases", function () {
            for (var i in gameDef.diseases) {
                var disease = gameDef.diseases[i];
                disease.status = disease.name === "Blue" ? "cure_discovered" : "eradicated";
            }
            gameDef.initial_infections = [ 3 ];
            randy.randInt = function (min, max) { return max; }
            gameSetup();

            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            spyOn(emitter, "emit").andCallThrough();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "San Francisco" })).toBeTruthy();
            expectMove(player1, "San Francisco");
            expectTreatment("San Francisco", "Blue", 3);
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "eradicate_disease",
                "disease": "Blue"
            });

            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "state_change",
                "state": {
                "name": "victory",
                "terminal": true
                }
            });

            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeFalsy();

            expectReplayMatch(game);
            });
        }); // discover_cure

        describe('share_knowledge', function () {
            it('allows giving the current location', function () {
            randy.randInt = function (min, max) { return max; }
            gameSetup();
            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();
            expect(game.act(player1, { "name": "draw_infection_card" })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();

            expect(game.act(player2,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1 })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "state_change",
                "state": {
                "name": "approve_action",
                "player": player2,
                "approve_player": player1,
                "approve_action": {
                    "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1
                },
                "parent": {
                    "name": "player_actions",
                    "player": player2,
                    "actions_remaining": 4,
                    "terminal": false
                },
                "terminal": false
                }
            });
            expect(emitter.emit.calls.length).toBe(1);

            expect(game.act(player2, { "name": "approve_action" })).toBeFalsy();
            expect(game.act(player1, { "name": "approve_action" })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "transfer_player_card",
                "from_player": player2,
                "to_player": player1,
                "card": { "type": "location", "location": "Atlanta" }
            });
            expectActions(player2, 3);
            expect(emitter.emit.calls.length).toBe(3);

            // As the card has been transferred, the action is now impossible
            expect(game.act(player2,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1 })).toBeFalsy();
            // But we are allowed to reverse it
            expect(game.act(player2,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player1,
                    "to_player": player2 })).toBeTruthy();

            expectReplayMatch(game);
            });

            it('allows receiving the current location', function () {
            gameSetup();

            spyOn(emitter, 'emit').andCallThrough();

            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1 })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "state_change",
                "state": {
                "name": "approve_action",
                "player": player1,
                "approve_player": player2,
                "approve_action": {
                    "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1
                },
                "parent": {
                    "name": "player_actions",
                    "player": player1,
                    "actions_remaining": 4,
                    "terminal": false
                },
                "terminal": false
                }
            });

            expectReplayMatch(game);
            });

            it('allows the other player to refuse the action', function () {
            gameSetup();

            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1 })).toBeTruthy();

            spyOn(emitter, 'emit').andCallThrough();

            expect(game.act(player1, { "name": "refuse_action" })).toBeFalsy();
            expect(game.act(player2, { "name": "refuse_action" })).toBeTruthy();

            expectActions(player1, 4);

            expectReplayMatch(game);
            });

            it('does not allow giving another location', function () {
            gameSetup();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "San Francisco",
                    "from_player": player1,
                    "to_player": player2 })).toBeFalsy();

            expectReplayMatch(game);
            });

            it('does not allow receiving another location', function () {
            gameSetup();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Chicago",
                    "from_player": player2,
                    "to_player": player1 })).toBeFalsy();

            expectReplayMatch(game);
            });

            it('allows the researcher to give any location', function () {
            randy.sample = function (arr) { return ["Researcher", "Medic"]; };
            gameSetup();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "San Francisco",
                    "from_player": player1,
                    "to_player": player2 })).toBeTruthy();

            expectReplayMatch(game);
            });

            it('does not allow the researcher to receive any location', function () {
            randy.sample = function (arr) { return ["Researcher", "Medic"]; };
            gameSetup();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Chicago",
                    "from_player": player2,
                    "to_player": player1 })).toBeFalsy();

            expectReplayMatch(game);
            });

            it('requires both players to be in the same location', function () {
            randy.sample = function (arr) { return ["Researcher", "Medic"]; };
            gameSetup();
            expect(game.act(player1, { "name": "action_drive", "player": player1, "location": "Chicago" })).toBeTruthy();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "San Francisco",
                    "from_player": player1,
                    "to_player": player2 })).toBeFalsy();

            expectReplayMatch(game);
            });
            
            it('checks availability of the card', function () {
            gameSetup();
            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player1,
                    "to_player": player2 })).toBeFalsy();

            expectReplayMatch(game);
            });

            it('forces the player to discard excess cards', function () {
            gameDef.max_player_cards = 4;
            gameSetup();

            spyOn(emitter, 'emit').andCallThrough();

            expect(game.act(player1,
                { "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1 })).toBeTruthy();

            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "state_change",
                "state": {
                "name": "approve_action",
                "player": player1,
                "approve_player": player2,
                "approve_action": {
                    "name": "action_share_knowledge",
                    "location": "Atlanta",
                    "from_player": player2,
                    "to_player": player1
                },
                "parent": {
                    "name": "player_actions",
                    "player": player1,
                    "actions_remaining": 4,
                    "terminal": false
                },
                "terminal": false
                }
            });

            var card = { "type": "location", "location": "Atlanta" };
            expect(game.act(player2, { "name": "approve_action" })).toBeTruthy();
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "transfer_player_card",
                "from_player": player2,
                "to_player": player1,
                "card": card
            });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "state_change",
                "state": {
                "name": "hand_limit_exceeded",
                "player": player1,
                "parent": {
                    "name": "player_actions",
                    "player": player1,
                    "actions_remaining": 4,
                    "terminal": false
                },
                "terminal": false
                }
            });

            expect(game.act(player1, { "name": "discard_player_card", "card" : card })).toBeTruthy();
            expectDiscard(player1, card);
            expectActions(player1, 3);

            expectReplayMatch(game);
            });
        }); // action_share_knowledge

        function shuffleSpecial(specialName, toIndex) {
            return function (arr) {
            arr = _.clone(arr);
            var special = _.find(arr, function (card) {
                return card.type === "special" && card.special === specialName;
            });
            if (special) {
                var index = _.indexOf(arr, special);
                arr.splice(index, 1);
                arr.splice(toIndex, 0, special);
            }
            return arr;
            };
        }

        describe("special_airlift", function () {
            it("allows a player to move himself", function () {
            randy.shuffle = shuffleSpecial("special_airlift", 0);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_airlift", "player": player1, "location": "Hong Kong" })).toBeTruthy();
            expectDiscard(player1, { "type": "special", "special": "special_airlift" });
            expectMove(player1, "Hong Kong");
            expect(emitter.emit.callCount).toBe(2);
            expectReplayMatch(game);
            });

            it("can be used outside of own turn", function () {
            randy.shuffle = shuffleSpecial("special_airlift", 1);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "special_airlift", "player": player2, "location": "Hong Kong" })).toBeTruthy();
            expectDiscard(player2, { "type": "special", "special": "special_airlift" });
            expectMove(player2, "Hong Kong");
            expect(emitter.emit.callCount).toBe(2);
            expectReplayMatch(game);
            });

            it("refuses to move to the current location", function () {
            randy.shuffle = shuffleSpecial("special_airlift", 0);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_airlift", "player": player1, "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("refuses to move without the card", function () {
            randy.shuffle = shuffleSpecial("special_airlift", 0);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "special_airlift", "player": player2, "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("requires approval when moving other players", function () {
                randy.shuffle = shuffleSpecial("special_airlift", 1);
                gameSetup();
                spyOn(emitter, 'emit').andCallThrough();
                testActionRequiringApproval(game, player2, { "name": "special_airlift", "player": player1, "location": "Hong Kong" }, player1);
                expectDiscard(player2, { "type": "special", "special": "special_airlift" });
                expectMove(player1, "Hong Kong");
                expect(emitter.emit.callCount).toBe(3);
                expect(game.sitatuation).toEqual(replay.situation.parent)
                expectReplayMatch(game);
            });

            it("can not be played during an epidemic", function () {
            randy.shuffle = shuffleSpecial("special_airlift", 1);
            gameSetup();
            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "special_airlift", "player": player2, "location": "Baghdad" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        }); // special_airlift

        describe("special_government_grant", function () {
            it("allows to build a research station", function () {
            randy.shuffle = shuffleSpecial("special_government_grant", 0);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_government_grant", "location": "Hong Kong" })).toBeTruthy();
            expectDiscard(player1, { "type": "special", "special": "special_government_grant" });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "build_research_center",
                "location": "Hong Kong"
            });
            expect(emitter.emit.callCount).toBe(2);
            expectReplayMatch(game);
            });

            it("can be used outside of own turn", function () {
            randy.shuffle = shuffleSpecial("special_government_grant", 1);
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "special_government_grant", "location": "Hong Kong" })).toBeTruthy();
            expectDiscard(player2, { "type": "special", "special": "special_government_grant" });
            expect(emitter.emit).toHaveBeenCalledWith({
                "event_type": "build_research_center",
                "location": "Hong Kong"
            });
            expect(emitter.emit.callCount).toBe(2);
            expectReplayMatch(game);
            });

            it("refuses to build without the card", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_government_grant", "location": "Hong Kong" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("refuses to build where a research center already exists", function () {
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_government_grant", "location": "Atlanta" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("refuses to build when research centers have run out", function () {
            gameDef.research_centers_available = 1;
            gameSetup();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player1, { "name": "special_government_grant", "location": "Paris" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });

            it("can not be played during an epidemic", function () {
            randy.shuffle = shuffleSpecial("special_government_grant", 1);
            gameSetup();
            skipTurnActions(player1);
            expect(game.act(player1, { "name": "draw_player_card" })).toBeTruthy();
            spyOn(emitter, 'emit').andCallThrough();
            expect(game.act(player2, { "name": "special_government_grant", "location": "Baghdad" })).toBeFalsy();
            expect(emitter.emit).not.toHaveBeenCalled();
            expectReplayMatch(game);
            });
        }); // special_airlift
    }); // .act()
}); // Game
