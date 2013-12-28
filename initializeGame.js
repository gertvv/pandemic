var _ = require("underscore");
var clone = require("clone");

function nameMatcher(name) {
  return function(arg) {
    return arg.name == name;
  };
}

/**
 * Initialize the game state based on the given data.
 * Performs a number of useful transformations on the data, but does not do
 * anything related to the specific game setup (i.e. nothing that requires
 * knowing the number of players or difficulty level).
 */
function initializeGame(input) {
  // Add fixed-value fields
  var output = _.extend(clone(input), {
      state: { 'type': 'in_progress', 'name': 'setup' },
      players: [],
      research_centers: [],
      player_cards_discard: [],
      infection_cards_discard: [],
      infection_cards_removed: [],
      infection_rate_index: 0,
      outbreak_count: 0,
    });

  // Delete transformed fields
  delete output.routes;
  
  // Create player cards
  output.player_cards_draw = _.map(input.locations,
    function(location) {
      return { "type": "location", "location": location.name };
    }).concat(_.map(input.specials,
    function(special) {
      return { "type": "special", "special": special.name };
    }));
  
  // Create infection cards
  output.infection_cards_draw = _.map(input.locations,
    function(location) {
      return { "type": "location", "location": location.name };
    });

  // Add adjacency to locations
  var infections =
    _.object(_.pluck(input.diseases, 'name'), _.times(input.diseases.length, function(x) { return 0; }));
  output.locations = _.map(input.locations,
    function(location) {
      return _.extend(_.clone(location), { "adjacent": [], "infections": _.clone(infections) });
    });
  _.each(input.routes, function(route) {
    var location0 = _.find(output.locations, nameMatcher(route[0]));
    if (location0) {
      location0.adjacent.push(route[1]); 
    } else {
      throw "Location " + route[0] + " not found.";
    }
    var location1 = _.find(output.locations, nameMatcher(route[1]));
    if (location1) {
      location1.adjacent.push(route[0]); 
    } else {
      throw "Location " + route[1] + " not found.";
    }
  });

  return output;
}

module.exports = initializeGame;
