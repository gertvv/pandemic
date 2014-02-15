module.exports = {
  "map": {
    "url": "img/map.jpg",
    "width": 1024,
    "height": 545,
    "offset_y": -50,
    "offset_x": 0
  },
  "research_centers_available": 6,
  "max_outbreaks": 7,
  "outbreak_marker_size": { "width": 50, "height": 50 },
  "outbreak_markers": [
      {
        "x": 27,
        "y": 279
      },
      {
        "x": 75,
        "y": 309
      },
      {
        "x": 27,
        "y": 333 
      },
      {
        "x": 75,
        "y": 363
      },
      {
        "x": 27,
        "y": 392 
      },
      {
        "x": 75,
        "y": 418 
      },
      {
        "x": 27,
        "y": 451 
      },
      {
        "x": 75,
        "y": 472
      },
      {
        "x": 27,
        "y": 511
      }
    ],
  "infection_rate_marker_size": { "width": 50, "height": 50 },
  "infection_rate_levels": [
      {
        "rate": 2,
        "x": 395,
        "y": 538
      },
      {
        "rate": 2,
        "x": 445,
        "y": 538
      },
      {
        "rate": 2,
        "x": 494,
        "y": 538
      },
      {
        "rate": 3,
        "x": 544,
        "y": 538
      },
      {
        "rate": 3,
        "x": 593,
        "y": 538
      },
      {
        "rate": 4,
        "x": 643,
        "y": 538
      },
      {
        "rate": 4,
        "x": 692,
        "y": 538
      }
    ],
  "initial_infections": [ 3, 3, 3, 2, 2, 2, 1, 1, 1 ],
  "initial_player_cards": { 2: 4, 3: 3, 4: 2 },
  "max_player_cards": 7,
  "roles": [
    {
      "name": "Dispatcher",
      "color": "#c03ea2"
    },
    {
      "name": "Operations Expert",
      "color": "#80cb26"
    },
    {
      "name": "Scientist",
      "color": "#e6e6e7"
    },
    {
      "name": "Medic",
      "color": "#f38211"
    },
    {
      "name": "Researcher",
      "color": "#ab7845"
    }
  ],
  "specials": [
    {
      "name": "special_resilient_population",
      "title": "Resilient Population",
      "description": "Take a card from the Infection Discard Pile and remove it from the game."
    },
    {
      "name": "special_government_grant",
      "title": "Government Grant",
      "description": "Add a Research Station to any city for free."
    },
    {
      "name": "special_one_quiet_night",
      "title": "One Quiet Night",
      "description": "Skip the next infection phase entirely."
    },
    {
      "name": "special_airlift",
      "title": "Airlift",
      "description": "Move a player to any city for free."
    },
    {
      "name": "special_forecast",
      "title": "Forecast",
      "description": "Examine the top 6 cards from the Infection Draw Pile and rearrange them in the order of your choice."
    }
  ],
  "disease_marker_size": { "width": 40, "height": 40 },
  "diseases": [
    {
      "name": "Blue",
      "color": "#1d61ce",
      "status": "no_cure",
      "cubes": 24,
      "x": 735,
      "y": 87
    },
    {
      "name": "Yellow",
      "color": "#f6d633",
      "status": "no_cure",
      "cubes": 24,
      "x": 796,
      "y": 87
    },
    {
      "name": "Black",
      "color": "#363636",
      "status": "no_cure",
      "cubes": 24,
      "x": 857,
      "y": 87
    },
    {
      "name": "Red",
      "color": "#c21b08",
      "status": "no_cure",
      "cubes": 24,
      "x": 918,
      "y": 87
    }
  ],
  "location_marker_size": { "width": 27, "height": 27 },
  "starting_location": "Atlanta",
  "locations": [
    {
      "name": "San Francisco",
      "disease": "Blue",
      "x": 50,
      "y": 210
    },
    {
      "name": "Chicago",
      "disease": "Blue",
      "x": 131,
      "y": 159
    },
    {
      "name": "Toronto",
      "disease": "Blue",
      "x": 190,
      "y": 149
    },
    {
      "name": "Atlanta",
      "disease": "Blue",
      "x": 165,
      "y": 203
    },
    {
      "name": "New York",
      "disease": "Blue",
      "x": 269,
      "y": 176
    },
    {
      "name": "Washington DC",
      "disease": "Blue",
      "x": 232,
      "y": 225
    },
    {
      "name": "London",
      "disease": "Blue",
      "x": 390,
      "y": 123
    },
    {
      "name": "Madrid",
      "disease": "Blue",
      "x": 387,
      "y": 209
    },
    {
      "name": "Essen",
      "disease": "Blue",
      "x": 469,
      "y": 105
    },
    {
      "name": "Paris",
      "disease": "Blue",
      "x": 454,
      "y": 150
    },
    {
      "name": "Milan",
      "disease": "Blue",
      "x": 507,
      "y": 149
    },
    {
      "name": "St. Petersburg",
      "disease": "Blue",
      "x": 544,
      "y": 92
    },
    {
      "name": "Algiers",
      "disease": "Black",
      "x": 454,
      "y": 247
    },
    {
      "name": "Cairo",
      "disease": "Black",
      "x": 520,
      "y": 269
    },
    {
      "name": "Riyadh",
      "disease": "Black",
      "x": 598,
      "y": 297
    },
    {
      "name": "Baghdad",
      "disease": "Black",
      "x": 588,
      "y": 232
    },
    {
      "name": "Istanbul",
      "disease": "Black",
      "x": 546,
      "y": 190
    },
    {
      "name": "Moscow",
      "disease": "Black",
      "x": 595,
      "y": 132
    },
    {
      "name": "Tehran",
      "disease": "Black",
      "x": 643,
      "y": 184
    },
    {
      "name": "Karachi",
      "disease": "Black",
      "x": 646,
      "y": 249
    },
    {
      "name": "Delhi",
      "disease": "Black",
      "x": 710,
      "y": 222
    },
    {
      "name": "Mumbai",
      "disease": "Black",
      "x": 670,
      "y": 306
    },
    {
      "name": "Chennai",
      "disease": "Black",
      "x": 721,
      "y": 348
    },
    {
      "name": "Kolkata",
      "disease": "Black",
      "x": 765,
      "y": 252
    },
    {
      "name": "Bangkok",
      "disease": "Red",
      "x": 772,
      "y": 321
    },
    {
      "name": "Jakarta",
      "disease": "Red",
      "x": 779,
      "y": 395
    },
    {
      "name": "Sydney",
      "disease": "Red",
      "x": 949,
      "y": 481
    },
    {
      "name": "Manila",
      "disease": "Red",
      "x": 895,
      "y": 349
    },
    {
      "name": "Ho Chi Minh",
      "disease": "Red",
      "x": 830,
      "y": 351
    },
    {
      "name": "Hong Kong",
      "disease": "Red",
      "x": 818,
      "y": 279
    },
    {
      "name": "Shanghai",
      "disease": "Red",
      "x": 809,
      "y": 223
    },
    {
      "name": "Beijing",
      "disease": "Red",
      "x": 800,
      "y": 158
    },
    {
      "name": "Seoul",
      "disease": "Red",
      "x": 877,
      "y": 160
    },
    {
      "name": "Tokyo",
      "disease": "Red",
      "x": 930,
      "y": 184
    },
    {
      "name": "Osaka",
      "disease": "Red",
      "x": 923,
      "y": 235
    },
    {
      "name": "Taipei",
      "disease": "Red",
      "x": 880,
      "y": 261
    },
    {
      "name": "Los Angeles",
      "disease": "Yellow",
      "x": 66,
      "y": 270
    },
    {
      "name": "Mexico City",
      "disease": "Yellow",
      "x": 131,
      "y": 307
    },
    {
      "name": "Miami",
      "disease": "Yellow",
      "x": 207,
      "y": 267
    },
    {
      "name": "Bogota",
      "disease": "Yellow",
      "x": 204,
      "y": 331
    },
    {
      "name": "Lima",
      "disease": "Yellow",
      "x": 183,
      "y": 398
    },
    {
      "name": "Santiago",
      "disease": "Yellow",
      "x": 208,
      "y": 477
    },
    {
      "name": "Buenos Aires",
      "disease": "Yellow",
      "x": 274,
      "y": 493
    },
    {
      "name": "São Paulo",
      "disease": "Yellow",
      "x": 316,
      "y": 435
    },
    {
      "name": "Lagos",
      "disease": "Yellow",
      "x": 446,
      "y": 317
    },
    {
      "name": "Khartoum",
      "disease": "Yellow",
      "x": 545,
      "y": 328
    },
    {
      "name": "Johannesburg",
      "disease": "Yellow",
      "x": 528,
      "y": 456
    },
    {
      "name": "Kinshasa",
      "disease": "Yellow",
      "x": 495,
      "y": 388
    }
  ],
  "routes": [
    ["San Francisco", "Chicago"],
    ["San Francisco", "Tokyo"],
    ["San Francisco", "Manila"],
    ["San Francisco", "Los Angeles"],
    ["Chicago", "Atlanta"],
    ["Chicago", "Toronto"],
    ["Chicago", "Los Angeles"],
    ["Chicago", "Mexico City"],
    ["Toronto", "New York"],
    ["Toronto", "Washington DC"],
    ["New York", "London"],
    ["New York", "Madrid"],
    ["New York", "Washington DC"],
    ["Atlanta", "Washington DC"],
    ["Atlanta", "Miami"],
    ["Washington DC", "Miami"],
    ["London", "Essen"],
    ["London", "Madrid"],
    ["London", "Paris"],
    ["Madrid", "Paris"],
    ["Madrid", "Algiers"],
    ["Madrid", "São Paulo"],
    ["Paris", "Essen"],
    ["Paris", "Milan"],
    ["Paris", "Algiers"],
    ["Essen", "Milan"],
    ["Essen", "St. Petersburg"],
    ["St. Petersburg", "Moscow"],
    ["St. Petersburg", "Istanbul"],
    ["Milan", "Istanbul"],
    ["Los Angeles", "Sydney"],
    ["Los Angeles", "Mexico City"],
    ["Mexico City", "Miami"],
    ["Mexico City", "Bogota"],
    ["Mexico City", "Lima"],
    ["Lima", "Santiago"],
    ["Lima", "Bogota"],
    ["Bogota", "Miami"],
    ["Bogota", "Buenos Aires"],
    ["Bogota", "São Paulo"],
    ["São Paulo", "Buenos Aires"],
    ["São Paulo", "Lagos"],
    ["Lagos", "Khartoum"],
    ["Lagos", "Kinshasa"],
    ["Kinshasa", "Johannesburg"],
    ["Kinshasa", "Khartoum"],
    ["Khartoum", "Johannesburg"],
    ["Khartoum", "Cairo"],
    ["Algiers", "Istanbul"],
    ["Cairo", "Algiers"],
    ["Cairo", "Istanbul"],
    ["Cairo", "Baghdad"],
    ["Cairo", "Riyadh"],
    ["Istanbul", "Moscow"],
    ["Istanbul", "Baghdad"],
    ["Moscow", "Tehran"],
    ["Tehran", "Baghdad"],
    ["Tehran", "Karachi"],
    ["Tehran", "Delhi"],
    ["Baghdad", "Riyadh"],
    ["Baghdad", "Karachi"],
    ["Riyadh", "Karachi"],
    ["Karachi", "Delhi"],
    ["Karachi", "Mumbai"],
    ["Delhi", "Mumbai"],
    ["Delhi", "Chennai"],
    ["Delhi", "Kolkata"],
    ["Mumbai", "Chennai"],
    ["Chennai", "Bangkok"],
    ["Chennai", "Jakarta"],
    ["Chennai", "Kolkata"],
    ["Kolkata", "Hong Kong"],
    ["Kolkata", "Bangkok"],
    ["Jakarta", "Sydney"],
    ["Jakarta", "Ho Chi Minh"],
    ["Jakarta", "Bangkok"],
    ["Bangkok", "Ho Chi Minh"],
    ["Bangkok", "Hong Kong"],
    ["Ho Chi Minh", "Manila"],
    ["Ho Chi Minh", "Hong Kong"],
    ["Manila", "Sydney"],
    ["Manila", "Taipei"],
    ["Manila", "Hong Kong"],
    ["Hong Kong", "Shanghai"],
    ["Hong Kong", "Taipei"],
    ["Shanghai", "Taipei"],
    ["Shanghai", "Tokyo"],
    ["Shanghai", "Seoul"],
    ["Shanghai", "Beijing"],
    ["Beijing", "Seoul"],
    ["Seoul", "Tokyo"],
    ["Tokyo", "Osaka"],
    ["Osaka", "Taipei"]
  ]
};
