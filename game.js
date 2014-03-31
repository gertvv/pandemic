var _ = require('underscore');
var clone = require('clone');

function Game(eventSink, randy) {
    "use strict";
    this.situation = null;

    this.findLocation = function (locationName) {
        return _.findWhere(this.situation.locations, {name: locationName});
    };

    this.findDisease = function (diseaseName) {
        return _.findWhere(this.situation.diseases, {name: diseaseName});
    };

    this.findDiseaseByLocation = function (locationName) {
        var diseaseName = this.findLocation(locationName).disease;
        return this.findDisease(diseaseName);
    };

    this.findPlayer = function (playerId) {
        return _.findWhere(this.situation.players, {id: playerId });
    };

    function player_actions_state(player) {
        return {
            "name": "player_actions",
            "player": player,
            "actions_remaining": 4,
            "terminal": false
        };
    }

    this.emitStateChange = function () {
        eventSink.emit({
            "event_type": "state_change",
            "state": _.clone(this.situation.state)
        });
    };

    this.enterDrawState = function (player, number) {
        if (this.situation.player_cards_draw.length === 0) {
            this.situation.state = { "name": "defeat_out_of_player_cards", "terminal": true };
        } else {
            this.situation.state = {
                "name": "draw_player_cards",
                "player": player,
                "draws_remaining": number,
                "terminal": false
            };
        }
        this.emitStateChange();
    };

    this.drawPlayerCard = function (player) {
        var card = this.situation.player_cards_draw.shift();
        eventSink.emit({
            "event_type": "draw_player_card",
            "player": player,
            "card": card
        });
        this.situation.state.draws_remaining = this.situation.state.draws_remaining - 1;
        if (card.type === "epidemic") {
            return this.handleEpidemic();
        }
        this.findPlayer(player).hand.push(card);
        if (this.findPlayer(player).hand.length > this.situation.max_player_cards) {
            return this.handleHandLimitExceeded(player);
        }
        return true;
    };

    this.handleEpidemic = function () {
        this.situation.infection_rate_index = this.situation.infection_rate_index + 1;
        eventSink.emit({"event_type": "infection_rate_increased"});
        if (!this.drawInfection(3, true)) {
            return false;
        }
        this.situation.state = {
            "name": "epidemic",
            "player": this.situation.state.player,
            "parent": this.situation.state,
            "terminal": false
        };
        this.emitStateChange();
        return true;
    };

    this.handleHandLimitExceeded = function (player) {
        this.situation.state = {
            "name": "hand_limit_exceeded",
            "player": player,
            "parent": this.situation.state,
            "terminal": false
        };
        this.emitStateChange();
        return true;
    };

    this.infect = function (loc, dis, num) {
        var max_infections, self, cur_loc, location;
        max_infections = 3;
        self = this;

        function _infect(locs, dis, out) {
            var disease = self.findDisease(dis);
            if (disease.status === "eradicated") {
                return true;
            }

            if (_.isEmpty(locs)) {
                return true;
            }

            cur_loc = _.first(locs);
            location = self.findLocation(cur_loc);

            // If an outbreak already occurred here, skip
            if (_.contains(out, cur_loc)) {
                return _infect(_.rest(locs), dis, out);
            }

            // Outbreak
            if (location.infections[dis] === max_infections) {
                eventSink.emit({
                    "event_type": "outbreak",
                    "location": cur_loc,
                    "disease": dis
                });
                self.situation.outbreak_count = self.situation.outbreak_count + 1;
                if (self.situation.outbreak_count > self.situation.max_outbreaks) {
                    self.situation.state = { "name": "defeat_too_many_outbreaks", "terminal": true };
                    self.emitStateChange();
                    return false;
                }
                return _infect(_.rest(locs).concat(location.adjacent), dis, out.concat([cur_loc]));
            }

            // Out of cubes
            if (disease.cubes === 0) {
                self.situation.state = {
                    "name": "defeat_too_many_infections",
                    "disease": dis,
                    "terminal": true
                };
                self.emitStateChange();
                return false;
            }

            // Infection
            location.infections[dis] = location.infections[dis] + 1;
            disease.cubes = disease.cubes - 1;
            eventSink.emit({
                "event_type": "infect",
                "location": cur_loc,
                "disease": dis
            });

            return _infect(_.rest(locs), dis, out);
        }

        return _infect(_.times(num, function () { return loc; }), dis, []);
    };

    this.drawInfection = function (n, last) {
        var card, location;
        if (last) {
            card = this.situation.infection_cards_draw.pop();
        } else {
            card = this.situation.infection_cards_draw.shift();
        }
        this.situation.infection_cards_discard.unshift(card);
        eventSink.emit({
            "event_type": "draw_and_discard_infection_card",
            "card": card
        });

        location = this.findLocation(card.location);
        return this.infect(location.name, location.disease, n);
    };

    this.startInfectionPhase = function (player) {
        var rate, players, index, nextPlayer;
        if (this.situation.quiet_night === true) {
            this.situation.quiet_night = false;
            players = this.situation.players;
            index = _.indexOf(players, _.find(players, function (p) { return p.id === player; }));
            nextPlayer = index + 1 === players.length ? players[0] : players[index + 1];

            this.situation.state = {
                "name": "player_actions",
                "player": nextPlayer.id,
                "actions_remaining": 4,
                "terminal": false
            };
        } else {
            rate = this.situation.infection_rate_levels[this.situation.infection_rate_index].rate;
            this.situation.state = {
                "name": "draw_infection_cards",
                "player": player,
                "draws_remaining": rate,
                "terminal": false
            };
        }
        this.emitStateChange();
    };

    this.resume = function (situation) {
        if (!_.isNull(this.situation)) {
            throw "Game already initialized!";
        }
        this.situation = clone(situation);
    };

    this.setup = function (gameDef, players, settings) {
        var initialState, roles, self, nDraw;
        if (!_.isNull(this.situation)) {
            throw "Game already initialized!";
        }
        initialState = _.extend(clone(gameDef), settings);

        // assign roles
        roles = _.map(gameDef.roles, function (role) { return role.name; });
        roles = randy.sample(roles, players.length);
        initialState.players = _.map(_.zip(players, roles),
            function (arr) {
                var player = _.object(["id", "role"], arr);
                player.location = gameDef.starting_location;
                player.hand = [];
                return player;
            });

        // create initial research center
        initialState.research_centers.push({ "location": gameDef.starting_location });
        initialState.research_centers_available = initialState.research_centers_available - 1;

        // shuffle infection cards
        initialState.infection_cards_draw = randy.shuffle(gameDef.infection_cards_draw);

        // shuffle player cards and insert epidemic cards
        function setupPlayerCards() {
            var cards, nEpidemics, initialDeal, nReserved, nCards, n, chunkSize, larger, counts, chunks;
            cards = randy.shuffle(gameDef.player_cards_draw);
            nEpidemics = settings.number_of_epidemics;
            if (nEpidemics > 0) {
                initialDeal = gameDef.initial_player_cards[players.length];
                nReserved = initialDeal * players.length;
                nCards = gameDef.player_cards_draw.length;
                n = nCards - nReserved;
                chunkSize = Math.floor(n / nEpidemics);
                larger = n - (nEpidemics * chunkSize);
                counts = _.times(
                    nEpidemics,
                    function (index) {
                        return chunkSize + (index < larger ? 1 : 0);
                    }
                );
                chunks = _.map(
                    counts,
                    function (count) {
                        var chunk = [this.index, this.index + count];
                        this.index += count;
                        return chunk;
                    },
                    { "index": nReserved }
                );

                return _.reduce(chunks, function (memo, chunk, index) {
                    var where = randy.randInt(chunk[0], chunk[1]);
                    return memo.concat(cards.slice(chunk[0], where)).concat([{ "type": "epidemic", "number": index }]).concat(cards.slice(where, chunk[1]));
                }, cards.slice(0, nReserved));
            }
            return cards;
        }

        initialState.player_cards_draw = setupPlayerCards();
        initialState.state = { "name": "setup", "terminal": false };

        // Make the initial state known
        eventSink.emit({ "event_type": "initial_situation", "situation": initialState });

        this.situation = clone(initialState);
        self = this;

        // Initial infections
        _.each(initialState.initial_infections, function (n) {
            self.drawInfection(n);
        });

        // Initial draws
        nDraw = gameDef.initial_player_cards[players.length];
        _.each(_.range(nDraw), function () {
            _.each(self.situation.players, function (player) {
                self.drawPlayerCard(player.id);
            });
        });

        // Give turn to first player
        this.situation.state = player_actions_state(self.situation.players[0].id);
        this.emitStateChange();
    };

    this.resumeDrawPlayerCards = function () {
        var parent = this.situation.state.parent;
        if (parent.name !== "draw_player_cards") {
            throw "invalid state";
        }
        if (parent.draws_remaining > 0) {
            this.enterDrawState(parent.player, parent.draws_remaining);
        } else {
            this.startInfectionPhase(parent.player);
        }
    };

    this.resumePlayerActions = function () {
        if (this.situation.state.parent.name !== "player_actions") {
            throw "invalid state";
        }
        this.situation.state = this.situation.state.parent;
        this.situation.state.actions_remaining = this.situation.state.actions_remaining - 1;
        if (this.situation.state.actions_remaining === 0) {
            this.enterDrawState(this.situation.state.player, 2);
        } else {
            this.emitStateChange();
        }
    };

    this.discardPlayerCard = function (player, card) {
        var thePlayer = this.findPlayer(player);
        eventSink.emit({
            "event_type": "discard_player_card",
            "player": player,
            "card": card
        });
        thePlayer.hand.splice(_.indexOf(thePlayer.hand, card), 1);
        this.situation.player_cards_discard.unshift(card);
    };

    this.requestApproval = function (player, other, action) {
        this.situation.state = {
            "name": "approve_action",
            "player": player,
            "approve_player": other,
            "approve_action": action,
            "parent": this.situation.state,
            "terminal": false
        };
        this.emitStateChange();
    };

    this.is_not_dispatcher_and_other_player_selected = function (player, action) {
        var thePlayer = this.findPlayer(player);
        if (player !== action.player && thePlayer.role !== "Dispatcher") {
            return true;
        }
        return false;
    };

    this.is_valid_player = function (player) {
        var playerObject = this.findPlayer(player);
        if (!playerObject) {
            console.log("Invalid player ", player);
            return false;
        }
        return true;
    };

    this.check_action_prerequisites = function (player, action) {
        var thePlayer, movedPlayerObject, source, origin, destination, location, disease, self, cards, from, to;
        if (action.name.match(/^action_/)) {
            if (this.situation.state.name !== "player_actions") {
                return false;
            }
            if (player !== this.situation.state.player) {
                return false;
            }
        }
        switch (action.name) {
        case "refuse_action":
        case "approve_action":
            if ((this.situation.state.name !== "approve_action") || (this.situation.state.approve_player !== player)) {
                return false;
            }
            break;
        case "action_drive":
            if (this.is_not_dispatcher_and_other_player_selected(player, action) || !this.is_valid_player(action.player)) {
                return false;
            }
            movedPlayerObject = this.findPlayer(action.player);
            source = this.findLocation(movedPlayerObject.location);
            if (!_.contains(source.adjacent, action.location)) {
                return false;
            }
            break;
        case "action_charter_flight":
            thePlayer = this.findPlayer(player);
            if (this.is_not_dispatcher_and_other_player_selected(player, action)) {
                return false;
            }

            movedPlayerObject = this.findPlayer(action.player);
            if (movedPlayerObject.location === action.location) {
                return false;
            }

            if (!this.getCard(thePlayer.hand, 'location', thePlayer.location)) {
                return false;
            }
            break;
        case "action_direct_flight":
            thePlayer = this.findPlayer(player);
            if (this.is_not_dispatcher_and_other_player_selected(player, action)) {
                return false;
            }

            movedPlayerObject = this.findPlayer(action.player);
            if (movedPlayerObject.location === action.location) {
                return false;
            }

            if (!this.getCard(thePlayer.hand, 'location', action.location)) {
                return false;
            }

            break;
        case "action_shuttle_flight":
            if (this.is_not_dispatcher_and_other_player_selected(player, action)) {
                return false;
            }

            movedPlayerObject = this.findPlayer(action.player);
            origin = movedPlayerObject.location;
            destination = action.location;
            if (origin === destination) {
                return false;
            }

            if (!_.find(this.situation.research_centers, function (center) { return center.location === origin; })) {
                return false;
            }
            if (!_.find(this.situation.research_centers, function (center) { return center.location === destination; })) {
                return false;
            }
            break;
        case "action_converge":
            thePlayer = this.findPlayer(player);
            if (thePlayer.role !== "Dispatcher") {
                return false;
            }

            movedPlayerObject = this.findPlayer(action.player);
            if (!this.is_valid_player(action.player)) {
                return false;
            }

            if (movedPlayerObject.location === action.location) {
                return false;
            }

            if (!_.find(this.situation.players, function (player) { return player.location === action.location; })) {
                return false;
            }
            break;
        case "action_treat_disease":
            thePlayer = this.findPlayer(player);
            location = this.findLocation(thePlayer.location);
            disease = this.findDisease(action.disease);
            if (_.isUndefined(disease)) {
                return false;
            }
            if (location.infections[disease.name] === 0) {
                return false;
            }
            break;
        case "action_build_research_center":
            thePlayer = this.findPlayer(player);
            if (this.situation.research_centers_available === 0) {
                return false;
            }
            if (_.find(this.situation.research_centers, function (center) { return center.location === thePlayer.location; })) {
                return false;
            }

            if ((thePlayer.role !== "Operations Expert") && (!this.getCard(thePlayer.hand, 'location', thePlayer.location))) {
                return false;
            }
            break;
        case "action_discover_cure":
            self = this;
            thePlayer = this.findPlayer(player);
            if (((thePlayer.role === "Scientist") && (action.cards.length !== 4)) || ((thePlayer.role !== "Scientist") && (action.cards.length !== 5))) {
                return false;
            }
            cards = _.map(action.cards, function (card) { return _.find(thePlayer.hand, function (handCard) { return _.isEqual(handCard, card); }); });
            if (_.some(cards, _.isUndefined)) {
                return false;
            }
            disease = self.findDiseaseByLocation(cards[0].location);
            if (disease.status !== "no_cure") {
                return false;
            }
            if (!_.every(cards, function (card) { return self.findDiseaseByLocation(card.location) === disease; })) {
                return false;
            }
            break;
        case "action_share_knowledge":
            from = this.findPlayer(action.from_player);
            to = this.findPlayer(action.to_player);
            if (!from || !to || from.id === to.id) {
                return false;
            }
            if (!this.getCard(from.hand, 'location', action.location)) {
                return false;
            }
            if (from.location !== to.location) {
                return false;
            }

            if (from.role !== "Researcher" && (from.location !== action.location)) {
                return false;
            }
            if (!(player === to.id || player === from.id)) {
                return false;
            }
            break;
        case "special_airlift":
            if (this.situation.state.name === "epidemic") {
                return false;
            }
            thePlayer = this.findPlayer(player);
            if (!this.is_valid_player(action.player)) {
                return false;
            }

            movedPlayerObject = this.findPlayer(action.player);
            if (movedPlayerObject.location === action.location) {
                return false;
            }

            if (!this.getCard(thePlayer.hand, 'special', action.name)) {
                return false;
            }
            break;
        case "special_government_grant":
            if (this.situation.state.name === "epidemic") {
                return false;
            }
            thePlayer = this.findPlayer(player);

            if (!this.getCard(thePlayer.hand, 'special', action.name)) {
                return false;
            }

            if (this.situation.research_centers_available === 0) {
                return false;
            }
            if (_.find(this.situation.research_centers, function (center) { return center.location === action.location; })) {
                return false;
            }
            break;
        case "draw_player_card":
            if (this.situation.state.name !== (action.name + 's')) {
                return false;
            }
            if (player !== this.situation.state.player) {
                return false;
            }
            if (!this.drawPlayerCard(player)) { // Defeat
                return true;
            }
            break;
        case "draw_infection_card":
            if (this.situation.state.name !== (action.name + 's')) {
                return false;
            }
            if (player !== this.situation.state.player) {
                return false;
            }
            if (!this.drawInfection(1)) { // Defeat
                return true;
            }
            break;
        case "discard_player_card":
            thePlayer = this.findPlayer(player);
            if (!_.find(thePlayer.hand, function (card) { return _.isEqual(card, action.card); })) {
                return false;
            }
            break;
        case "increase_infection_intensity":
            if (this.situation.state.name !== "epidemic") {
                return false;
            }
            if (player !== this.situation.state.player) {
                return false;
            }
            return true;
        }
        return true;
    };

    this.eventRequriesApproval = function (eventName) {
        var eventsThatRequireApproval = ["action_drive", "action_charter_flight", "action_direct_flight", "action_shuttle_flight", "action_converge", "special_airlift"];
        return _.contains(eventsThatRequireApproval, eventName);
    };

    this.emitMoveEventSink = function (event_type, player, location) {
        eventSink.emit({
            "event_type": event_type,
            "player": player,
            "location": location
        });
    };

    this.medicEndMoveSpecialEffect = function () {
    // Cure all known diseases at this location withotu using a move action
        var medic, location, cured;
        medic = _.find(this.situation.players, function (player) { return player.role === "Medic"; });
        if (medic) {
            location = this.findLocation(medic.location);
            cured = _.filter(this.situation.diseases, function (disease) { return disease.status === "cure_discovered"; });
            _.each(cured, function (disease) {
                var number = location.infections[disease.name];
                if (number > 0) {
                    location.infections[disease.name] -= number;
                    disease.cubes += number;
                    eventSink.emit({
                        "event_type": "treat_disease",
                        "location": location.name,
                        "disease": disease.name,
                        "number": number
                    });
                }
            });
        }
    };

    this.updateEradicatedDiseaseList = function () {
        var eradicated = _.filter(this.situation.diseases, function (disease) {
            return disease.status === "cure_discovered" && disease.cubes === disease.cubes_total;
        }),
            i, disease;
        for (i = 0; i < eradicated.length; i = i + 1) {
            disease = eradicated[i];
            disease.status = "eradicated";
            eventSink.emit({
                "event_type": "eradicate_disease",
                "disease": disease.name
            });
        }
    };

    this.getCard = function (hand, attribute, targetToMatch) {
        return _.find(hand, function (card) { return card[attribute] === targetToMatch; });
    };

    this.movePawn = function (newLocation, playerSelected, player, card) {
        if (card && player) {
            this.discardPlayerCard(player, card);
        }
        this.findPlayer(playerSelected).location = newLocation;

        this.emitMoveEventSink("move_pawn", playerSelected, newLocation);
    };

    this.performRegularAction = function (thePlayer, playerSelected, approved, player, action) {
        var card, cards, location, disease, number, self, from, to, other;
        switch (action.name) {
        case "action_pass":
            break;
        case "action_drive":
        case "action_shuttle_flight":
        case "action_converge":
            this.movePawn(action.location, playerSelected);
            break;
        case "action_charter_flight":
            card = this.getCard(thePlayer.hand, 'location', thePlayer.location);
            this.movePawn(action.location, playerSelected, player, card);
            break;
        case "action_direct_flight":
            card = this.getCard(thePlayer.hand, 'location', action.location);
            this.movePawn(action.location, playerSelected, player, card);
            break;
        case "action_treat_disease":
            location = this.findLocation(thePlayer.location);
            disease = this.findDisease(action.disease);
            number = 1;
            if (disease.status === "cure_discovered" || thePlayer.role === "Medic") {
                number = location.infections[disease.name];
            }
            location.infections[disease.name] -= number;
            disease.cubes += number;
            eventSink.emit({
                "event_type": "treat_disease",
                "location": location.name,
                "disease": disease.name,
                "number": number
            });
            break;
        case "action_build_research_center":
            if (thePlayer.role !== "Operations Expert") {
                card = this.getCard(thePlayer.hand, 'location', thePlayer.location);
                this.discardPlayerCard(player, card);
            }

            eventSink.emit({
                "event_type": "build_research_center",
                "location": thePlayer.location
            });
            this.situation.research_centers.push({ "location": thePlayer.location });
            this.situation.research_centers_available = this.situation.research_centers_available - 1;
            break;
        case "action_discover_cure":
            disease = this.findDiseaseByLocation(action.cards[0].location);
            self = this;
            cards = _.map(action.cards, function (card) { return _.find(thePlayer.hand, function (handCard) { return _.isEqual(handCard, card); }); });
            _.each(cards, function (card) {
                self.discardPlayerCard(player, card);
            });
            disease.status = "cure_discovered";
            eventSink.emit({
                "event_type": "discover_cure",
                "disease": disease.name
            });
            break;
        case "action_share_knowledge":
            from = this.findPlayer(action.from_player);
            to = this.findPlayer(action.to_player);
            card = this.getCard(from.hand, 'location', action.location);

            other = player === to.id ? from.id : to.id;
            if (!approved) {
                this.situation.state = {
                    "name": "approve_action",
                    "player": player,
                    "approve_player": other,
                    "approve_action": action,
                    "parent": this.situation.state,
                    "terminal": false
                };
                this.emitStateChange();
                return true;
            }

            from.hand.splice(_.indexOf(from.hand, card), 1);
            to.hand.push(card);
            eventSink.emit({
                "event_type": "transfer_player_card",
                "from_player": from.id,
                "to_player": to.id,
                "card": card
            });
            if (to.hand.length > this.situation.max_player_cards) {
                return this.handleHandLimitExceeded(to.id);
            }
            break;
        default:
            return false;
        }
        return null;
    };

    this.performSpecialAction = function (playerSelected, playerSelectedObject, card, player, action) {
        var thePlayer = this.findPlayer(player);
        if (action.name === "special_airlift") {
            this.discardPlayerCard(player, card);
            playerSelectedObject.location = action.location;
            eventSink.emit({
                "event_type": "move_pawn",
                "player": playerSelected,
                "location": action.location
            });
        } else if (action.name === "special_government_grant") {
            this.discardPlayerCard(player, card);
            eventSink.emit({
                "event_type": "build_research_center",
                "location": action.location
            });
            this.situation.research_centers.push({ "location": action.location });
            this.situation.research_centers_available = this.situation.research_centers_available - 1;
        } else if (action.name === "special_one_quiet_night") {
            this.discardPlayerCard(player, card);
            this.situation.quiet_night = true;
        } else if (action.name === "special_resilient_population") {
            this.discardPlayerCard(player, card);
            eventSink.emit({
                "event_type": "discard_discarded_city",
                "location": action.location
            });
            this.situation.infection_cards_discard = _.filter(this.situation.infection_cards_discard, function (card) { return card.location !== action.location; });
        } else {
            return false;
        }
        return true;
    };

    this.isRegulatoryCardAction = function (actionName) {
        var regulatoryCardActions = ["draw_player_card", "discard_player_card", "increase_infection_intensity", "draw_infection_card"];
        return _.contains(regulatoryCardActions, actionName);
    };

    this.performRegulatoryCardAction = function (player, action) {
        var thePlayer = this.findPlayer(player),
            card,
            cards,
            players,
            index,
            nextPlayer;
        switch (action.name) {
        case "draw_player_card":
            if (this.situation.state.draws_remaining === 0) {
                this.startInfectionPhase(player);
            } else if (this.situation.state.name === "draw_player_cards") {
                this.enterDrawState(player, this.situation.state.draws_remaining);
            } else {
                this.emitStateChange();
            }
            break;
        case "discard_player_card":
            card = _.find(thePlayer.hand, function (card) { return _.isEqual(card, action.card); });

            this.discardPlayerCard(player, card);
            if ((this.situation.state.name === "hand_limit_exceeded") && (this.situation.state.player === player) && (thePlayer.hand.length <= this.situation.max_player_cards)) {
                if (this.situation.state.parent.name === "player_actions") {
                    this.resumePlayerActions();
                } else {
                    this.resumeDrawPlayerCards();
                }
            }
            break;
        case "increase_infection_intensity":
            cards = randy.shuffle(this.situation.infection_cards_discard);
            eventSink.emit({
                "event_type": "infection_cards_restack",
                "cards": cards
            });
            this.situation.infection_cards_discard = [];
            this.situation.infection_cards_draw = cards.concat(this.situation.infection_cards_draw);
            this.resumeDrawPlayerCards();
            break;
        case "draw_infection_card":
            this.situation.state.draws_remaining = this.situation.state.draws_remaining - 1;
            if (this.situation.state.draws_remaining === 0) {
                players = this.situation.players;
                index = _.indexOf(players, _.find(players, function (p) { return p.id === player; }));
                nextPlayer = index + 1 === players.length ? players[0] : players[index + 1];
                this.situation.state = {
                    "name": "player_actions",
                    "player": nextPlayer.id,
                    "actions_remaining": 4,
                    "terminal": false
                };
            }
            this.emitStateChange();
            break;
        }
    };

    this.act = function (player, action) {
        var approved, thePlayer, playerSelected, playerSelectedObject, card, activeDisease, action_result;
        if (!this.check_action_prerequisites(player, action)) {
            return false;
        }

        if (action.name === "refuse_action") {
            this.situation.state = this.situation.state.parent;
            this.emitStateChange();
            return true;
        }

        approved = (action.name === "approve_action");
        if (action.name === "approve_action") {
            action = this.situation.state.approve_action;
            player = this.situation.state.player;
            this.situation.state = this.situation.state.parent;
            eventSink.emit({
                "event_type": "approve_action",
            });
        }
        thePlayer = this.findPlayer(player);
        if (this.situation.state.name.match(/^defeat/)) {
            return true;
        }
        if (action.name.match(/^action_/)) {

            playerSelected = action.player;
            playerSelectedObject = this.findPlayer(playerSelected);

            if (!approved && (playerSelected !== player) && this.eventRequriesApproval(action.name)) {
                this.requestApproval(player, playerSelected, action);
                return true;
            }
            action_result = this.performRegularAction(thePlayer, playerSelected, approved, player, action);
            if (!(action_result === null)) {
                return action_result;
            }

            this.situation.state.actions_remaining = this.situation.state.actions_remaining - 1;
            if (this.situation.state.actions_remaining === 0) {
                this.enterDrawState(player, 2);
            } else {
                this.emitStateChange();
            }
        } else if (action.name.match(/^special_/)) {

            playerSelected = action.player;
            playerSelectedObject = this.findPlayer(playerSelected);

            if (!approved && (playerSelected !== player) && this.eventRequriesApproval(action.name)) {
                this.requestApproval(player, playerSelected, action);
                return true;
            }

            card = this.getCard(thePlayer.hand, 'special', action.name);

            if (!this.performSpecialAction(playerSelected, playerSelectedObject, card, player, action)) {
                return false;
            }
        } else if (this.isRegulatoryCardAction(action.name)) {
            this.performRegulatoryCardAction(player, action);
        } else {
            return false;
        }

        this.medicEndMoveSpecialEffect();
        this.updateEradicatedDiseaseList();

        activeDisease = _.find(this.situation.diseases, function (disease) { return disease.status !== "eradicated"; });
        if (!activeDisease) {
            this.situation.state = { "name": "victory", "terminal": true };
            this.emitStateChange();
        }

        return true;
    };

    return this;
}

module.exports = Game;
