var _ = require('underscore');
var clone = require('clone');

function nameMatcher(name) {
  return function(arg) {
    return arg.name == name;
  };
}

function Game(gameDef, players, settings, eventSink, randy) {
  this.situation = null;

  this.findDisease = function(diseaseName) {
    return _.find(this.situation.diseases, nameMatcher(diseaseName));
  }

  this.findDiseaseByLocation = function(locationName) {
    var diseaseName = _.find(this.situation.locations, nameMatcher(locationName)).disease;
    return this.findDisease(diseaseName);
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

    // shuffle player cards and insert infection cards
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
      var card = self.situation.infection_cards_draw.shift();
      self.situation.infection_cards_discard.unshift(card);
      eventSink.emit({
        "event_type": "draw_and_discard_infection_card",
        "card": card
      });
      // TODO: increment infection counters
      eventSink.emit({
        "event_type": "infect",
        "location": card.location,
        "disease": self.findDiseaseByLocation(card.location).name,
        "number": n
      });
    });

    // Initial draws
    var nDraw = gameDef.initial_player_cards[players.length];
    _.each(_.range(nDraw), function(idx) {
      _.each(self.situation.players, function(player) {
        var card = self.situation.player_cards_draw.shift();
        player.hand.push(card);
        eventSink.emit({
          "event_type": "draw_player_card",
          "player": player.id,
          "card": card
        });
      });
    });
  };
  return this;
}

module.exports = Game;
