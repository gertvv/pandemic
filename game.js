var _ = require('underscore');
var clone = require('clone');

function nameMatcher(name) {
  return function(arg) {
    return arg.name == name;
  };
}

function Game(gameDef, players, settings, eventSink, randy) {
  this.situation = null;
  this.parentState = null;

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

  function draw_player_cards_state(player) {
    return {
      "name": "draw_player_cards",
      "player": player,
      "draws_remaining": 2,
      "terminal": false
    };
  }

  this.emitStateChange = function() {
    eventSink.emit({
      "event_type": "state_change",
      "state": _.clone(this.situation.state)
    });
  };

  this.drawPlayerCard = function(player) {
    var card = this.situation.player_cards_draw.shift();
    eventSink.emit({
      "event_type": "draw_player_card",
      "player": player,
      "card": card
    });
    this.situation.state.draws_remaining--;
    if (card.type === "epidemic") {
      this.handleEpidemic();
    } else {
      this.findPlayer(player).hand.push(card);
    }
  }

  this.handleEpidemic = function() {
    eventSink.emit({"event_type": "infection_rate_increased"});
    this.drawInfection(3, true);
    this.parentState = this.situation.state;
    this.situation.state = { "name": "epidemic" };
    this.emitStateChange();
  };

  this.infect = function(loc, dis, num, out) {
    function emitInfect(n) {
      eventSink.emit({
        "event_type": "infect",
        "location": loc,
        "disease": dis,
        "number": n
      });
    }

    if (_.isUndefined(out)) {
      out = [];
    }

    if (_.contains(out, loc)) return true;

    var max_infections = 3;
    var location = this.findLocation(loc);

    // Detect outbreaks
    var capacity = max_infections - location.infections[dis];
    if (num > capacity) {
      if (capacity > 0) {
        location.infections[dis] = max_infections;
        emitInfect(capacity);
      }
      eventSink.emit({
        "event_type": "outbreak",
        "location": loc,
        "disease": dis
      });
      this.situation.outbreak_count++;
      if (this.situation.outbreak_count > this.situation.max_outbreaks) {
        this.situation.state = { "name": "defeat_too_many_outbreaks", "terminal": true };
        this.emitStateChange();
        return false;
      }
      var self = this;
      out.push(loc);
      var ok = true;
      _.each(location.adjacent, function(neighbour) {
        if (ok) ok = self.infect(neighbour, dis, 1, out);
      });
      return ok;
    } else {
      location.infections[dis] += num;
      emitInfect(num);
    }
    return true;
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
    this.infect(location.name, location.disease, n);
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

  this.setup = function() {
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

      return _.reduce(chunks, function(memo, chunk) {
          var where = randy.randInt(chunk[0], chunk[1]);
          return memo
            .concat(cards.slice(chunk[0], where))
            .concat([{ "type": "epidemic" }])
            .concat(cards.slice(where, chunk[1]));
        }, cards.slice(0, nReserved));
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

  this.act = function(player, action) {
    if (action.name == "action_pass") {
      if (this.situation.state.name !== "player_actions") {
        return false;
      }
      if (player !== this.situation.state.player) {
        return false;
      }
      this.situation.state.actions_remaining--;
      if (this.situation.state.actions_remaining === 0) {
        this.situation.state = draw_player_cards_state(player);
      }
      this.emitStateChange();
      return true;
    } else if (action.name == "draw_player_card") {
      if (this.situation.state.name !== "draw_player_cards") {
        return false;
      }
      if (player !== this.situation.state.player) {
        return false;
      }
      this.drawPlayerCard(player);
      if (this.situation.state.draws_remaining === 0) {
        this.startInfectionPhase(player);
      }
      return true;
    } else if (action.name == "increase_infection_intensity") {
      if (this.situation.state.name !== "epidemic") {
        return false;
      }
      if (player !== this.parentState.player) {
        return false;
      }
      var cards = randy.shuffle(this.situation.infection_cards_discard);
      eventSink.emit({
        "event_type": "infection_cards_restack",
        "cards": cards
      });
      this.situation.infection_cards_discard = [];
      this.situation.infection_cards_draw = cards.concat(this.situation.infection_cards_draw);
      if (this.parentState.name !== "draw_player_cards") {
        throw "invalid state";
      }
      if (this.parentState.draws_remaining > 0) {
        this.situation.state = this.parentState;
        this.emitStateChange();
      } else {
        this.startInfectionPhase(player);
      }
      return true;
    } else if (action.name == "draw_infection_card") {
      if (this.situation.state.name !== "draw_infection_cards") {
        return false;
      }
      if (player !== this.situation.state.player) {
        return false;
      }
      this.drawInfection(1);
      this.situation.state.draws_remaining--;
      this.emitStateChange();
      return true;
    }
    return false;
  };

  return this;
}

module.exports = Game;
