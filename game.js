var _ = require('underscore');
var clone = require('clone');

function nameMatcher(name) {
  return function(arg) {
    return arg.name === name;
  };
}

function Game(eventSink, randy) {
  this.situation = null;

  this.findLocation = function(locationName) {
    return _.find(this.situation.locations, nameMatcher(locationName));
  }

  this.findDisease = function(diseaseName) {
    return _.find(this.situation.diseases, nameMatcher(diseaseName));
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
    var rate = this.situation.infection_rate_levels[this.situation.infection_rate_index].rate;
    this.situation.state = {
      "name": "draw_infection_cards",
      "player": player,
      "draws_remaining": rate,
      "terminal": false
    };
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
        if (this.situation.state.name !== "approve_action") {
          return false;
        }
        if (this.situation.state.approve_player !== player) {
          return false;
        }
        break;
      case "action_drive":
        var thePlayer = this.findPlayer(player);
        if (player !== action.player && thePlayer.role !== "Dispatcher") {
          return false;
        }
        var other = action.player;
        var theOther = this.findPlayer(other);
        if (!theOther) {
          console.log("Invalid player ", other);
          return false;
        }
        var source = this.findLocation(theOther.location);
        if (!_.contains(source.adjacent, action.location)) {
          return false;
        }
        break;
      case "action_charter_flight":
        var thePlayer = this.findPlayer(player);
        if (player !== action.player && thePlayer.role !== "Dispatcher") {
          return false;
        }

        var other = action.player;
        var theOther = this.findPlayer(other);
        if (theOther.location === action.location) {
          return false;
        }

        var card = _.find(thePlayer.hand, function(card) {
          return card.location === thePlayer.location;
        })
        if (!card) {
          return false;
        }
        break;
      case "action_direct_flight":
        var thePlayer = this.findPlayer(player);
        if (player !== action.player && thePlayer.role !== "Dispatcher") {
          return false;
        }

        var other = action.player;
        var theOther = this.findPlayer(other);
        if (theOther.location === action.location) {
          return false;
        }

        var card = _.find(thePlayer.hand, function(card) {
          return card.location === action.location;
        })
        if (!card) {
          return false;
        }
        break;
      case "action_shuttle_flight":
        var thePlayer = this.findPlayer(player);
        if (player !== action.player && thePlayer.role !== "Dispatcher") {
          return false;
        }

        var other = action.player;
        var theOther = this.findPlayer(other);
        var origin = theOther.location;
        var destination = action.location;
        if (origin === destination) {
          return false;
        }

        if (!_.find(this.situation.research_centers, function(center) {
          return center.location === origin;
        })) {
          return false;
        }
        if (!_.find(this.situation.research_centers, function(center) {
          return center.location === destination;
        })) {
          return false;
        }
        break;
      case "action_converge":
        var thePlayer = this.findPlayer(player);
        if (thePlayer.role !== "Dispatcher") {
          return false;
        }

        var other = action.player;
        var theOther = this.findPlayer(other);
        if (!theOther) {
          console.log("Invalid player ", other);
          return false;
        }
        if (theOther.location === action.location) {
          return false;
        }

        if (!_.find(this.situation.players, function(player) {
          return player.location === action.location;
        })) {
          return false;
        }
        break;
      case "action_treat_disease":
        var thePlayer = this.findPlayer(player);
        var location = this.findLocation(thePlayer.location);
        var disease = this.findDisease(action.disease);
        if (_.isUndefined(disease)) {
          return false;
        }
        if (location.infections[disease.name] === 0) {
          return false;
        }
        break;
      case "action_build_research_center":
        var thePlayer = this.findPlayer(player);
        if (this.situation.research_centers_available === 0) {
          return false;
        }
        if (_.find(this.situation.research_centers, function(center) {
          return center.location === thePlayer.location;
        })) {
          return false;
        };

        if (thePlayer.role !== "Operations Expert") {
          var card = _.find(thePlayer.hand, function(card) {
            return card.location === thePlayer.location;
          });
          if (!card) {
            return false;
          }
        }
        break;
      case "action_discover_cure":
        var self = this;
        var thePlayer = this.findPlayer(player);
        if (thePlayer.role === "Scientist") {
          if (action.cards.length !== 4) return false;
        } else {
          if (action.cards.length !== 5) return false;
        }
        var cards = _.map(action.cards, function(card) {
          return _.find(thePlayer.hand, function(handCard) {
            return _.isEqual(handCard, card);
          });
        });
        if (_.some(cards, _.isUndefined)) {
          return false;
        }
        var disease = self.findDiseaseByLocation(cards[0].location);
        if (disease.status !== "no_cure") {
          return false;
        }
        if (!_.every(cards, function(card) {
            return self.findDiseaseByLocation(card.location) === disease; })) {
          return false;
        }
        break;
      case "action_share_knowledge":
        var from = this.findPlayer(action.from_player);
        var to = this.findPlayer(action.to_player);
        if (!from || !to || from.id == to.id) {
          return false;
        }
        var card = _.find(from.hand, function(card) {
          return card.location === action.location; })
        if (!card) {
          return false;
        }
        if (from.location !== to.location) {
          return false;
        }
        if (from.role !== "Researcher" && from.location !== action.location) {
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
        var thePlayer = this.findPlayer(player);
        var other = action.player;
        var theOther = this.findPlayer(other);
        if (!theOther) { 
          return false;
        }

        if (theOther.location === action.location) {
          return false;
        }

        var card = _.find(thePlayer.hand, function(card) {
          return card.special === "special_airlift";
        });
        if (!card) {
          return false;
        }
        break;
      case "special_government_grant":
        if (this.situation.state.name === "epidemic") {
          return false;
        }
        var thePlayer = this.findPlayer(player);

        var card = _.find(thePlayer.hand, function(card) {
          return card.special === action.name;
        });
        if (!card) {
          return false;
        }

        if (this.situation.research_centers_available === 0) {
          return false;
        }
        if (_.find(this.situation.research_centers, function(center) {
          return center.location === action.location; })) {
          return false;
        };
        break;
      case "draw_player_card":
        if (this.situation.state.name !== "draw_player_cards") {
          return false;
        }
        if (player !== this.situation.state.player) {
          return false;
        }
        if (!this.drawPlayerCard(player)) { // Defeat
          return true;
        }
        break;
      case "discard_player_card":
        var thePlayer = this.findPlayer(player);
        var card = _.find(thePlayer.hand, function(card) {
          return _.isEqual(card, action.card);
        });
        if (!card) {
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
        break;
      case "draw_infection_card":
        if (this.situation.state.name !== "draw_infection_cards") {
          return false;
        }
        if (player !== this.situation.state.player) {
          return false;
        }
        if (!this.drawInfection(1)) { // Defeat
          return true;
        }
    }
    return true;
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

    var approved = false;
    if (action.name === "approve_action") {
      action = this.situation.state.approve_action;
      player = this.situation.state.player;
      this.situation.state = this.situation.state.parent;
      approved = true;
    }

    if (action.name.match(/^action_/)) {
      if (action.name === "action_pass") {
      } else if (action.name === "action_drive") {
        var other = action.player;
        var theOther = this.findPlayer(other);

        if (!approved && other !== player) {
          this.requestApproval(player, other, action);
          return true;
        } else {
          theOther.location = action.location;
          eventSink.emit({
            "event_type": "move_pawn",
            "player": other,
            "location": action.location
          });
        }
      } else if (action.name === "action_charter_flight") {
        var thePlayer = this.findPlayer(player);
        var other = action.player;
        var theOther = this.findPlayer(other);
        var card = _.find(thePlayer.hand, function(card) {
          return card.location === thePlayer.location; 
        })

        if (!approved && other !== player) {
          this.requestApproval(player, other, action);
          return true;
        } else {
          this.discardPlayerCard(player, card);
          theOther.location = action.location;
          eventSink.emit({
            "event_type": "move_pawn",
            "player": other,
            "location": action.location
          });
        }
      } else if (action.name === "action_direct_flight") {
        var thePlayer = this.findPlayer(player);
        var other = action.player;
        var theOther = this.findPlayer(other);
        var card = _.find(thePlayer.hand, function(card) {
          return card.location === action.location;
        })

        if (!approved && other !== player) {
          this.requestApproval(player, other, action);
          return true;
        } else {
          this.discardPlayerCard(player, card);
          theOther.location = action.location;
          eventSink.emit({
            "event_type": "move_pawn",
            "player": other,
            "location": action.location
          });
        }
      } else if (action.name === "action_shuttle_flight") {
        var other = action.player;
        var theOther = this.findPlayer(other);

        if (!approved && other !== player) {
          this.requestApproval(player, other, action);
          return true;
        } else {
          theOther.location = action.location;
          eventSink.emit({
            "event_type": "move_pawn",
            "player": other,
            "location": action.location
          });
        }
      } else if (action.name === "action_converge") {
        var other = action.player;
        var theOther = this.findPlayer(other);

        if (!approved && other !== player) {
          this.requestApproval(player, other, action);
          return true;
        } else {
          theOther.location = action.location;
          eventSink.emit({
            "event_type": "move_pawn",
            "player": other,
            "location": action.location
          });
        }
      } else if (action.name === "action_treat_disease") {
        var thePlayer = this.findPlayer(player);
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
      } else if (action.name === "action_build_research_center") {
        var thePlayer = this.findPlayer(player);

        if (thePlayer.role !== "Operations Expert") {
          var card = _.find(thePlayer.hand, function(card) {
            return card.location === thePlayer.location;
          });
          this.discardPlayerCard(player, card);
        }

        eventSink.emit({
          "event_type": "build_research_center",
          "location": thePlayer.location
        });
        this.situation.research_centers.push({ "location": thePlayer.location });
        this.situation.research_centers_available--;
      } else if (action.name === "action_discover_cure") {
        var self = this;
        var thePlayer = this.findPlayer(player);
        var cards = _.map(action.cards, function(card) {
          return _.find(thePlayer.hand, function(handCard) {
            return _.isEqual(handCard, card);
          });
        });
        _.each(cards, function(card) {
          self.discardPlayerCard(player, card);
        });
        disease.status = "cure_discovered"
        eventSink.emit({
          "event_type": "discover_cure",
          "disease": disease.name 
        });
      } else if (action.name === "action_share_knowledge") {
        var from = this.findPlayer(action.from_player);
        var to = this.findPlayer(action.to_player);
        var card = _.find(from.hand, function(card) {
          return card.location === action.location;
        })

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
      } else {
        return false;
      }

      this.situation.state.actions_remaining--;
      if (this.situation.state.actions_remaining === 0) {
        this.enterDrawState(player, 2);
      } else {
        this.emitStateChange();
      }
    } else if (action.name === "special_airlift") {
      var thePlayer = this.findPlayer(player);
      var other = action.player;
      var theOther = this.findPlayer(other);
      var card = _.find(thePlayer.hand, function(card) {
        return card.special === "special_airlift";
      });

      if (!approved && other !== player) {
        this.requestApproval(player, other, action);
        return true;
      } else {
        this.discardPlayerCard(player, card);
        theOther.location = action.location;
        eventSink.emit({
          "event_type": "move_pawn",
          "player": other,
          "location": action.location
        });
      }
    } else if (action.name === "special_government_grant") {
      var thePlayer = this.findPlayer(player);
      var card = _.find(thePlayer.hand, function(card) {
        return card.special === action.name;
      });

      this.discardPlayerCard(player, card);
      eventSink.emit({
        "event_type": "build_research_center",
        "location": action.location
      });
      this.situation.research_centers.push({ "location": thePlayer.location });
      this.situation.research_centers_available--;
    } else if (action.name === "draw_player_card") {
      if (this.situation.state.draws_remaining === 0) {
        this.startInfectionPhase(player);
      } else if (this.situation.state.name === "draw_player_cards") {
        this.enterDrawState(player, this.situation.state.draws_remaining);
      } else {
        this.emitStateChange();
      }
    } else if (action.name === "discard_player_card") {
      var thePlayer = this.findPlayer(player);
      var card = _.find(thePlayer.hand, function(card) {
        return _.isEqual(card, action.card);
      });
      this.discardPlayerCard(player, card);
      if (this.situation.state.name === "hand_limit_exceeded" &&
          this.situation.state.player === player &&
          thePlayer.hand.length <= this.situation.max_player_cards) {
        if (this.situation.state.parent.name === "player_actions") {
          this.resumePlayerActions();
        } else {
          this.resumeDrawPlayerCards();
        }
      }
    } else if (action.name === "increase_infection_intensity") {
      var cards = randy.shuffle(this.situation.infection_cards_discard);
      eventSink.emit({
        "event_type": "infection_cards_restack",
        "cards": cards
      });
      this.situation.infection_cards_discard = [];
      this.situation.infection_cards_draw = cards.concat(this.situation.infection_cards_draw);
      this.resumeDrawPlayerCards();
    } else if (action.name === "draw_infection_card") {
      this.situation.state.draws_remaining--;
      if (this.situation.state.draws_remaining === 0) {
        var players = this.situation.players;
        var index = _.indexOf(players, _.find(players, function(p) {
          return p.id === player;
        }));
        var nextPlayer = index + 1 === players.length ? players[0] : players[index + 1];
        this.situation.state = {
          "name": "player_actions",
          "player": nextPlayer.id,
          "actions_remaining": 4,
          "terminal": false
        };
      }
      this.emitStateChange();
    } else {
      return false;
    }

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

    var active = _.find(this.situation.diseases, function(disease) {
      return disease.status !== "eradicated";
    });
    if (!active) {
      this.situation.state = { "name": "victory", "terminal": true };
      this.emitStateChange();
    }

    return true;
  };

  return this;
}

module.exports = Game;
