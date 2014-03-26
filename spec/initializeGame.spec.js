var initializeGame = require("../initializeGame");
var _ = require("underscore");

describe("initializeGame", function() {
  var bareInput;
  var bareOutput;
 
  beforeEach(function() {
    bareInput = {
      "research_centers_available": 6,
      "max_outbreaks": 7,
      "infection_rate_levels": [
      ],
      "roles": [
      ],
      "specials": [
      ],
      "diseases": [
      ],
      "locations": [
      ],
      "routes": [
      ]
    };
    bareOutput = _.extend(_.clone(bareInput), {
      "state": { 'type': 'in_progress', 'name': 'setup' },
      "players": [],
      "research_centers" : [],
      "player_cards_draw": [],
      "player_cards_discard": [],
      "infection_cards_draw": [],
      "infection_cards_discard": [],
      "infection_cards_removed": [],
      "infection_rate_index": 0,
      "outbreak_count": 0
    });
    delete bareOutput.routes;
  });

  it("should extend the bare game and remove routes", function() {
    expect(initializeGame(bareInput)).toEqual(bareOutput);
  });

  it("should return additional fields verbatim", function() {
    bareInput.something = "anything";
    bareOutput.something = "anything";
    expect(initializeGame(bareInput)).toEqual(bareOutput);
  });

  it("should put locations on the player_cards_draw pile", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    expect(initializeGame(bareInput).player_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" }]);

    bareInput.locations.push({ "name": "Mexico City", "disease": "Yellow" });
    expect(initializeGame(bareInput).player_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" },
      { "type": "location", "location": "Mexico City" }]);
  });

  it("should put locations on the infection_cards_draw pile", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    expect(initializeGame(bareInput).infection_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" }]);

    bareInput.locations.push({ "name": "Mexico City", "disease": "Yellow" });
    expect(initializeGame(bareInput).infection_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" },
      { "type": "location", "location": "Mexico City" }]);
  });

  it("should put specials on the player_cards_draw pile", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    bareInput.specials.push({ "name": "special_airlift" });
    expect(initializeGame(bareInput).player_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" },
      { "type": "special", "special": "special_airlift" }]);

    bareInput.specials.push({ "name": "special_government_grant" });
    expect(initializeGame(bareInput).player_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" },
      { "type": "special", "special": "special_airlift" },
      { "type": "special", "special": "special_government_grant" }]);
  });

  it("should not put specials on the infection_cards_draw pile", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    bareInput.specials.push({ "name": "special_airlift" });
    expect(initializeGame(bareInput).infection_cards_draw).toEqual([
      { "type": "location", "location": "San Francisco" }]);
  });

  it("should add adjacency to each location", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [],
        "infections": {}
      }]);

    expect(bareInput.locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue"
      }]);
  });

  it("should translate routes to adjacency", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    bareInput.locations.push({ "name": "Los Angeles", "disease": "Yellow" });
    bareInput.routes.push(["San Francisco", "Los Angeles"]);
    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [ "Los Angeles" ],
        "infections": {}
      },
      {
        "name": "Los Angeles",
        "disease": "Yellow",
        "adjacent": [ "San Francisco" ],
        "infections": {}
      }]);

    bareInput.locations.push({ "name": "London", "disease": "Blue" });
    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [ "Los Angeles" ],
        "infections": {}
      },
      {
        "name": "Los Angeles",
        "disease": "Yellow",
        "adjacent": [ "San Francisco" ],
        "infections": {}
      },
      {
        "name": "London",
        "disease": "Blue",
        "adjacent": [],
        "infections": {}
      }]);

    bareInput.locations.push({ "name": "Mexico City", "disease": "Yellow" });
    bareInput.routes.push(["Mexico City", "Los Angeles"]);
    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [ "Los Angeles" ],
        "infections": {}
      },
      {
        "name": "Los Angeles",
        "disease": "Yellow",
        "adjacent": [ "San Francisco", "Mexico City" ],
        "infections": {}
      },
      {
        "name": "London",
        "disease": "Blue",
        "adjacent": [],
        "infections": {}
      },
      {
        "name": "Mexico City",
        "disease": "Yellow",
        "adjacent": [ "Los Angeles" ],
        "infections": {}
      }
      ]);
  });

  it("should add infection counters for each disease", function() {
    bareInput.locations.push({ "name": "San Francisco", "disease": "Blue" });
    bareInput.diseases.push({ "name": "Blue" });

    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [],
        "infections": { "Blue": 0 }
      }]);

    bareInput.diseases.push({ "name": "Red" });

    expect(initializeGame(bareInput).locations).toEqual([
      {
        "name": "San Francisco",
        "disease": "Blue",
        "adjacent": [],
        "infections": { "Blue": 0, "Red": 0 }
      }]);
  });

  it("should add cubes_total for each disease", function() {
    bareInput.diseases = [ { "name": "Blue", "cubes": 8 } ];
    expect(initializeGame(bareInput).diseases[0].cubes_total).toBe(8);
  });

  // TODO: initializeGame could also sanity-check the input
});
