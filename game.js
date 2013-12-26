var _ = require('underscore');

function Game(gameDef, players, settings, eventSink, randy) {
  this.setup = function() {
    var initialState = _.clone(gameDef);

    // assign roles
    var roles = _.map(gameDef.roles, function(role) { return role.name; });
    roles = randy.sample(roles, players.length);
    initialState.players = _.map(_.zip(players, roles),
        function(arr) { return _.object(["id", "role"], arr); });

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

    eventSink.emit({ "name": "initial_state", "state": initialState });
  };
  return this;
}

module.exports = Game;
