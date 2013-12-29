var _ = require("underscore");
var clone = require("clone");

function Replay() {
  function indexOfEqual(arr, el) {
    return _.indexOf(arr, _.find(arr, _.partial(_.isEqual, el)));
  }
  var situation = {};
  this.situation = situation;

  this.initial_situation = [
    function(e) {
      _.extend(situation, clone(e.situation));
    }
  ];

  this.draw_and_discard_infection_card = [
    function(e) {
      var index = indexOfEqual(situation.infection_cards_draw, e.card);
      var removed = situation.infection_cards_draw.splice(index, 1);
      situation.infection_cards_discard.unshift(removed[0]);
    }
  ];

  this.infect = [
    function(e) {
      var location = _.find(situation.locations,
        function(location) { return location.name === e.location; });
      location.infections[e.disease]++;
      var disease = _.find(situation.diseases,
        function(disease) { return disease.name === e.disease; });
      disease.cubes--;
    }
  ];

  this.draw_player_card = [
    function(e) {
      var index = indexOfEqual(situation.player_cards_draw, e.card);
      var removed = situation.player_cards_draw.splice(index, 1);
      var player = _.find(situation.players, function(player) { return player.id === e.player; });
      if (e.card.type !== "epidemic") player.hand.push(removed[0]);
    }
  ];

  this.state_change = [
    function(e) {
      situation.state = e.state;
    }
  ];

  this.infection_rate_increased = [
    function(e) {
      situation.infection_rate_index++;
    }
  ];

  this.infection_cards_restack = [
    function(e) {
      situation.infection_cards_discard = [];
      situation.infection_cards_draw = clone(e.cards).concat(situation.infection_cards_draw);
    }
  ];

  this.outbreak = [
    function(e) {
      situation.outbreak_count++;
    }
  ];

  this.receive = function(e) {
    _.each(this[e.event_type], function(f) { f(e) });
  }
};

module.exports = Replay;
