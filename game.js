var _ = require('underscore');
var clone = require('clone');

function Game(eventSink, randy) {
  this.situation = null;

  this.findLocation = function(locationName) {
    return _.findWhere(this.situation.locations, {name: locationName})
  }

  this.findDisease = function(diseaseName) {
    return _.findWhere(this.situation.diseases, {name: diseaseName})
  }

  this.findDiseaseByLocation = function(locationName) {
    var diseaseName = this.findLocation(locationName).disease;
    return this.findDisease(diseaseName);
  }

  this.findPlayer = function(playerId) {
    return _.find(this.situation.players, function(player) { return player.id === playerId; });
  }

  function player_actions_state(player) {
    return {
      "name": "player_actions",
      "player": player,
      "actions_remaining": 4,
      "terminal": false
    };
  }

  this.emitStateChange = function() {
    eventSink.emit({
      "event_type": "state_change",
      "state": _.clone(this.situation.state)
    });
  };

  this.enterDrawState = function(player, number) {
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
  }

  this.drawPlayerCard = function(player) {
    var card = this.situation.player_cards_draw.shift();
    eventSink.emit({
      "event_type": "draw_player_card",
      "player": player,
      "card": card
    });
    this.situation.state.draws_remaining--;
    if (card.type === "epidemic") {
      return this.handleEpidemic();
    } else {
      this.findPlayer(player).hand.push(card);
      if (this.findPlayer(player).hand.length > this.situation.max_player_cards) {
        return this.handleHandLimitExceeded(player);
      }
      return true;
    }
  }

  this.handleEpidemic = function() {
    this.situation.infection_rate_index++;
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

  this.handleHandLimitExceeded = function(player) {
    this.situation.state = {
      "name": "hand_limit_exceeded",
      "player": player,
      "parent": this.situation.state,
      "terminal": false
    };
    this.emitStateChange();
    return true;
  };

  this.infect = function(loc, dis, num) {
    var max_infections = 3;

    var self = this;

    function _infect(locs, dis, out) {
      var disease = self.findDisease(dis);
      if (disease.status === "eradicated") return true;

      if (_.isEmpty(locs)) return true;

      var loc = _.first(locs);
      var location = self.findLocation(loc);

      // If an outbreak already occurred here, skip
      if (_.contains(out, loc)) return _infect(_.rest(locs), dis, out);

      // Outbreak
      if (location.infections[dis] === max_infections) {
        eventSink.emit({
          "event_type": "outbreak",
          "location": loc,
          "disease": dis
        });
        self.situation.outbreak_count++;
        if (self.situation.outbreak_count > self.situation.max_outbreaks) {
          self.situation.state = { "name": "defeat_too_many_outbreaks", "terminal": true };
          self.emitStateChange();
          return false;
        }
        return _infect(_.rest(locs).concat(location.adjacent), dis, out.concat([loc]));
      }

      // Out of cubes
      if (disease.cubes === 0) {
        self.situation.state = {
          "name": "defeat_too_many_infections",
          "disease": dis,
          "terminal": true };
        self.emitStateChange();
        return false;
      }

      // Infection
      location.infections[dis]++;
      disease.cubes--;
      eventSink.emit({
        "event_type": "infect",
        "location": loc,
        "disease": dis
      });

      return _infect(_.rest(locs), dis, out);
    }

    return _infect(_.times(num, function() { return loc; }), dis, []);
  };

  this.drawInfection = function(n, last) {
    var card;
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

    var location = this.findLocation(card.location);
    return this.infect(location.name, location.disease, n);
  };

  this.startInfectionPhase = function(player) {
    if (this.situation.quiet_night === true) {
      this.situation.quiet_night = false;
      var players = this.situation.players;
      var index = _.indexOf(players, _.find(players, function(p) { return p.id === player; }));
      var nextPlayer = index + 1 === players.length ? players[0] : players[index + 1];

      this.situation.state = {
        "name": "player_actions",
        "player": nextPlayer.id,
        "actions_remaining": 4,
        "terminal": false
      };
    } else {
      var rate = this.situation.infection_rate_levels[this.situation.infection_rate_index].rate;
      this.situation.state = {
        "name": "draw_infection_cards",
        "player": player,
        "draws_remaining": rate,
        "terminal": false
      };
    }
    this.emitStateChange();
  }

  this.resume = function(situation) {
    if (!_.isNull(this.situation)) {
      throw "Game already initialized!";
    }
    this.situation = clone(situation);
  }

  this.setup = function(gameDef, players, settings) {
    if (!_.isNull(this.situation)) {
      throw "Game already initialized!";
    }
    var initialState = _.extend(clone(gameDef), settings);

    // assign roles
    var roles = _.map(gameDef.roles, function(role) { return role.name; });
    roles = randy.sample(roles, players.length);
    initialState.players = _.map(_.zip(players, roles),
        function(arr) {
          var player = _.object(["id", "role"], arr);
          player.location = gameDef.starting_location;
          player.hand = [];
          return player;
        });

    // create initial research center
    initialState.research_centers.push({ "location": gameDef.starting_location });
    initialState.research_centers_available--;

    // shuffle infection cards
    initialState.infection_cards_draw = randy.shuffle(gameDef.infection_cards_draw);

    // shuffle player cards and insert epidemic cards
    function setupPlayerCards() {
      var cards = randy.shuffle(gameDef.player_cards_draw);
      var nEpidemics = settings.number_of_epidemics;
      if (nEpidemics > 0) {
        var initialDeal = gameDef.initial_player_cards[players.length];
        var nReserved = initialDeal * players.length;
        var nCards = gameDef.player_cards_draw.length;
        var n = nCards - nReserved;
        var chunkSize = Math.floor(n / nEpidemics);
        var larger = n - (nEpidemics * chunkSize);
        var counts = _.times(nEpidemics,
            function(index) {
              return chunkSize + (index < larger ? 1 : 0);
            });

        var chunks = _.map(counts,
            function(count) { 
              var chunk = [this.index, this.index + count];
              this.index += count;
              return chunk;
            },
            { "index": nReserved });

        return _.reduce(chunks, function(memo, chunk, index) {
            var where = randy.randInt(chunk[0], chunk[1]);
            return memo
              .concat(cards.slice(chunk[0], where))
              .concat([{ "type": "epidemic", "number": index }])
              .concat(cards.slice(where, chunk[1]));
          }, cards.slice(0, nReserved));
      } else {
        return cards;
      }
    }
    initialState.player_cards_draw = setupPlayerCards();
    initialState.state = { "name": "setup", "terminal": false };

    // Make the initial state known
    eventSink.emit({ "event_type": "initial_situation", "situation": initialState });

    this.situation = clone(initialState);
    var self = this;

    // Initial infections
    _.each(initialState.initial_infections, function(n) {
      self.drawInfection(n);
    });

    // Initial draws
    var nDraw = gameDef.initial_player_cards[players.length];
    _.each(_.range(nDraw), function(idx) {
      _.each(self.situation.players, function(player) {
        self.drawPlayerCard(player.id);
      });
    });

    // Give turn to first player
    this.situation.state = player_actions_state(self.situation.players[0].id);
    this.emitStateChange();
  };

  this.resumeDrawPlayerCards = function() {
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

  this.resumePlayerActions = function() {
    if (this.situation.state.parent.name !== "player_actions") {
      throw "invalid state";
    }
    this.situation.state = this.situation.state.parent;
    this.situation.state.actions_remaining--;
    if (this.situation.state.actions_remaining === 0) {
      this.enterDrawState(player, 2);
    } else {
      this.emitStateChange();
    }
  };

  this.discardPlayerCard = function(player, card) {
    var thePlayer = this.findPlayer(player);
    eventSink.emit({
      "event_type": "discard_player_card",
      "player": player,
      "card": card
    });
    thePlayer.hand.splice(_.indexOf(thePlayer.hand, card), 1);
    this.situation.player_cards_discard.unshift(card);
  };

  this.requestApproval = function(player, other, action) {
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

  this.is_not_dispatcher_and_other_player_selected = function(player, action)  {
    var thePlayer = this.findPlayer(player);
    if (player !== action.player && thePlayer.role !== "Dispatcher") {
      return true;
    }
    return false;
  }

  this.is_valid_player = function(player)  {
      var playerObject = this.findPlayer(player);
      if (!playerObject) {
        console.log("Invalid player ", player);
        return false;
      }
      return true;
  }

  this.check_action_prerequisites = function(player, action) {
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
      case "special_airlift":
        if (this.situation.state.name === "epidemic") {
          return false;
        }
        var thePlayer = this.findPlayer(player);
        if (!this.is_valid_player(action.player)) { 
          return false;
        }

        var movedPlayerObject = this.findPlayer(action.player);
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
        var thePlayer = this.findPlayer(player);

        if (!this.getCard(thePlayer.hand, 'special', action.name)) {
          return false;
        }

        if (this.situation.research_centers_available === 0) {
          return false;
        }
        if (_.find(this.situation.research_centers, function(center) { return center.location === action.location; })) {
          return false;
        };
        break;
      case "special_one_quiet_night":
        if (this.situation.state.name === "epidemic") {
          return false;
        }
        var thePlayer = this.findPlayer(player);

        if (!this.getCard(thePlayer.hand, 'special', action.name)) {
          return false;
        }
        break;
      case "special_resilient_population":
        if (this.situation.state.name === "epidemic") {
          return false;
        }
        var thePlayer = this.findPlayer(player);

        if (!this.getCard(thePlayer.hand, 'special', action.name)) {
          return false;
        }
        if (!_.contains(_.pluck(this.situation.infection_cards_discard, 'location'), action.location)) {
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
        var thePlayer = this.findPlayer(player);
        if (!_.find(thePlayer.hand, function(card) { return _.isEqual(card, action.card); })) {
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
    }
    return true;
  }

  this.eventRequriesApproval = function(eventName) {
    eventsThatRequireApproval = ["action_drive", "action_charter_flight", "action_direct_flight", "action_converge", "special_airlift"]
    return _.contains(eventsThatRequireApproval, eventName)
  }

  this.emitMoveEventSink = function(event_type, player, location) {
    eventSink.emit({
      "event_type": event_type,
      "player": player,
      "location": location
    });
  }

  this.medicEndMoveSpecialEffect = function(player) {
    // Cure all known diseases at this location withotu using a move action
    var medic = _.find(this.situation.players, function(player) { return player.role === "Medic"; });
    if (medic) {
      var location = this.findLocation(medic.location);
      var cured = _.filter(this.situation.diseases, function(disease) { return disease.status === "cure_discovered"; });
      _.each(cured, function(disease) {
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
  }

  this.updateEradicatedDiseaseList = function() {
    var eradicated = _.filter(this.situation.diseases, function(disease) {
      return disease.status === "cure_discovered" && disease.cubes === disease.cubes_total;
    });
    for (i in eradicated) {
      var disease = eradicated[i];
      disease.status = "eradicated";
      eventSink.emit({
        "event_type": "eradicate_disease",
        "disease": disease.name
      });
    }
  }

  this.getCard = function(hand, attribute, targetToMatch) {
    return _.find(hand, function(card) { return card[attribute] === targetToMatch; });
  }

  this.movePawn = function(newLocation, selectedPawn, player, card) {
    if (card && player) {
      this.discardPlayerCard(player, card);
    }
    selectedPawn.location = newLocation;
    this.emitMoveEventSink("move_pawn", selectedPawn, newLocation);
  }

  this.performRegularAction = function(thePlayer, playerSelected, playerSelectedObject, approved, player, action) {
    switch (action.name) {
      case "action_pass":
        break;
      case "action_drive":
      case "action_shuttle_flight":
      case "action_converge":
        this.movePawn(action.location, playerSelected);
        break;
      case "action_charter_flight":
        var card = this.getCard(thePlayer.hand, 'location', thePlayer.location);
        this.movePawn(action.location, playerSelected, player, card);
        break;
      case "action_direct_flight":
        var card = this.getCard(thePlayer.hand, 'location', action.location);
        this.movePawn(action.location, playerSelected, player, card);
        break;
      case "action_treat_disease":
        var location = this.findLocation(thePlayer.location);
        var disease = this.findDisease(action.disease);
        var number = 1;
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
          var card = this.getCard(thePlayer.hand, 'location', thePlayer.location);
          this.discardPlayerCard(player, card);
        }

        eventSink.emit({
          "event_type": "build_research_center",
          "location": thePlayer.location
        });
        this.situation.research_centers.push({ "location": thePlayer.location });
        this.situation.research_centers_available--;
        break;
      case "action_discover_cure":
        var self = this;
        var cards = _.map(action.cards, function(card) { return _.find(thePlayer.hand, function(handCard) { return _.isEqual(handCard, card); }); });
        _.each(cards, function(card) {
          self.discardPlayerCard(player, card);
        });
        disease.status = "cure_discovered"
        eventSink.emit({
          "event_type": "discover_cure",
          "disease": disease.name 
        });
        break;
      case "action_share_knowledge":
        var from = this.findPlayer(action.from_player);
        var to = this.findPlayer(action.to_player);
        var card = this.getCard(from.hand, 'location', action.location);

        var other = player === to.id ? from.id : to.id;
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
        } else {
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
        }
        break;
      default:
        return false;
    }
    return true;
  }

  this.performSpecialAction = function(playerSelected, playerSelectedObject, card, player, action) {
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
      this.situation.research_centers.push({ "location": thePlayer.location });
      this.situation.research_centers_available--;
    } else if (action.name === "special_one_quiet_night") {
      this.discardPlayerCard(player, card);
      this.situation.quiet_night = true;
    } else if (action.name === "special_resilient_population") {
      this.discardPlayerCard(player, card);
      eventSink.emit({
        "event_type": "discard_discarded_city",
        "location": action.location
      });
      this.situation.infection_cards_discard = _.filter(this.situation.infection_cards_discard, function(card) { return card.location !== action.location });
    } else {
      return false;
    }
    return true;
  }

  this.isRegulatoryCardAction = function(actionName) {
    regulatoryCardActions = ["draw_player_card", "discard_player_card", "increase_infection_intensity", "draw_infection_card"]
    return _.contains(regulatoryCardActions, actionName)
  }

  this.performRegulatoryCardAction = function(player, action) {
    var thePlayer = this.findPlayer(player);
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
        var card = _.find(thePlayer.hand, function(card) { return _.isEqual(card, action.card); });

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
        var cards = randy.shuffle(this.situation.infection_cards_discard);
        eventSink.emit({
          "event_type": "infection_cards_restack",
          "cards": cards
        });
        this.situation.infection_cards_discard = [];
        this.situation.infection_cards_draw = cards.concat(this.situation.infection_cards_draw);
        this.resumeDrawPlayerCards();
        break;
      case "draw_infection_card":
        this.situation.state.draws_remaining--;
        if (this.situation.state.draws_remaining === 0) {
          var players = this.situation.players;
          var index = _.indexOf(players, _.find(players, function(p) { return p.id === player; }));
          var nextPlayer = index + 1 === players.length ? players[0] : players[index + 1];
          this.situation.state = {
            "name": "player_actions",
            "player": nextPlayer.id,
            "actions_remaining": 4,
            "terminal": false
          };
        }
        this.emitStateChange();
    }
  }

  this.act = function(player, action) {
    if (!this.check_action_prerequisites(player, action)) {
      return false;
    }

    if (action.name === "refuse_action") {
      this.situation.state = this.situation.state.parent;
      this.emitStateChange();
      return true;
    }

    var approved = (action.name === "approve_action");
    if (action.name === "approve_action") {
      action = this.situation.state.approve_action;
      player = this.situation.state.player;
      this.situation.state = this.situation.state.parent;
    }
    var thePlayer = this.findPlayer(player);
    if (action.name.match(/^action_/)) {

      var playerSelected = action.player;
      var playerSelectedObject = this.findPlayer(playerSelected);

      if (!approved && (playerSelected !== player) && this.eventRequriesApproval(action.name)) {
        this.requestApproval(player, playerSelected, action);
        return true;
      }

      if (!this.performRegularAction(thePlayer, playerSelected, playerSelectedObject, approved, player, action))
        return false;

      this.situation.state.actions_remaining--;
      if (this.situation.state.actions_remaining === 0) {
        this.enterDrawState(player, 2);
      } else {
        this.emitStateChange();
      }
    } else if (action.name.match(/^special_/)) {

      var playerSelected = action.player;
      var playerSelectedObject = this.findPlayer(playerSelected);
      var card = this.getCard(thePlayer.hand, 'special', action.name);

      if (!this.performSpecialAction(playerSelected, playerSelectedObject, card, player, action)) {
        return false;
      }
    } else if (this.isRegulatoryCardAction(action.name)) {
      this.performRegulatoryCardAction(player, action);
    } else {
      return false;
    }

    this.medicEndMoveSpecialEffect(player);
    this.updateEradicatedDiseaseList();

    var activeDisease = _.find(this.situation.diseases, function(disease) { return disease.status !== "eradicated"; });
    if (!activeDisease) {
      this.situation.state = { "name": "victory", "terminal": true };
      this.emitStateChange();
    }

    return true;
  };

  return this;
}

module.exports = Game;
