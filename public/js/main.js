var clone = angular.copy; // provide for replay.js
_.isEqual = angular.equals; // override so that .$$hashKey is ignored

var app = angular.module('pandemic', ['ui.router', 'ui.sortable', 'ui.autocomplete', 'ngCookies']);

app.factory('GameState', function() {
  var replay;

  function attachEventListeners() {
    replay.initial_situation.push(function(e) {
      service.game.state = "in progress";
    });
    replay.infect.push(function(e) {
      $scope.$broadcast("updateInfections", e.location);
    });
    replay.treat_disease.push(function(e) {
      $scope.$broadcast("updateInfections", e.location);
    });
    replay.move_pawn.push(function(e) {
      $scope.$broadcast("updatePawnLocations", e.location);
    });
    replay.build_research_center.push(function(e) {
      $scope.$broadcast("updateResearchCenters", e.location);
    });
  }

  function setGame(game, scope) {
    $scope = scope;
    if (socket) {
      init();
    }
    if (game) {
      replay = new Replay();
      attachEventListeners();
      game.situation = replay.situation;
      service.game = game;
      var host = window.document.location.host;
      var ws = 'ws://' + host + game.ws;
      socket = io.connect(ws);
      socket.on('chat', function(data) {
        $scope.$apply(function() {
          service.log.push({"type": "chat", "data": data});
        });
      });

      socket.on('event', function(data) {
        $scope.$apply(function() {
          replay.receive(data);
          service.log.push({"type": "event", "data": data});
        });
      });

      socket.on('users', function(data) {
        $scope.$apply(function() {
          service.users.length = 0;
          service.users.push.apply(service.users, data);
        });
      });

      socket.on('return', function(data) {
        console.log(data);
        $scope.$apply(function() {
          service.action_return.push(data);
          console.log(service.action_return);
        });
      });
    }
  };

  function post(text) {
    socket.emit('post', {
      text: text
    });
  };

  function act(action) {
    socket.emit('act', action);
  };

  function start() {
    socket.emit('start');
  };

  var service = {
    setGame: setGame,
    game: {},
    log: [],
    users: [],
    action_return: [],
    post: post,
    start: start,
    act: act
  };
  var socket, $scope;

  function init() {
      service.game = {};
      service.log = [];
      service.users = [];
      service.action_return = [];
      socket = null;
  }
  init();

  return service;
});

app.controller('ChatCtrl', function($scope, GameState) {
  $scope.text = '';
  $scope.log = GameState.log;
  $scope.users = GameState.users;
  $scope.post = GameState.post;
});

app.controller('MapCtrl', function($scope) {
});

app.controller('LobbyCtrl', function($scope, GameState) {
  $scope.users = GameState.users;
  $scope.startGame = function() {
    GameState.start();
  }
});

app.controller('ActionsCtrl', function($scope, GameState) {
  $scope.pass = function() {
    GameState.act({ "name": "action_pass" });
  };
  $scope.drive = function(player, location) {
    GameState.act({ "name": "action_drive", "player": player, "location": location });
  };
  $scope.directFlight = function(player, location) {
    GameState.act({ "name": "action_direct_flight", "player": player, "location": location });
  };
  $scope.charterFlight = function(player, location) {
    GameState.act({ "name": "action_charter_flight", "player": player, "location": location });
  };
  $scope.shuttleFlight = function(player, location) {
    GameState.act({ "name": "action_shuttle_flight", "player": player, "location": location });
  };
  $scope.converge = function(player, location) {
    GameState.act({ "name": "action_converge", "player": player, "location": location });
  };
  $scope.treatDisease = function(disease) {
    GameState.act({ "name": "action_treat_disease", "disease": disease });
  };
  $scope.buildResearchCenter = function() {
    GameState.act({ "name": "action_build_research_center" });
  };
  $scope.discoverCure = function() {
    var player = $scope.currentPlayer();
    var n = player.role === "Scientist" ? 4 : 5;
    GameState.act({ "name": "action_discover_cure", "cards": angular.copy(player.hand.slice(0, n)) });
  };
  $scope.discard = function(card) {
    GameState.act({ "name": "discard_player_card", "card": angular.copy(card) });
  };
  $scope.play = function(card) {
    $scope.currentAction = card.special;
  };
  $scope.shareKnowledgePartner = { "id": null };
  $scope.shareKnowledge = function() {
    var player = $scope.currentPlayer().id;
    var other = $scope.shareKnowledgePartner.id;
    var mode = $scope.shareKnowledgeType;
    var location = $scope.shareKnowledgeLocation;
    if (!location || !other || !mode) return;
    if (mode == "give") {
      GameState.act({
        "name": "action_share_knowledge",
        "from_player": player,
        "to_player": other,
        "location": location
      });
    } else if (mode == "receive") {
      GameState.act({
        "name": "action_share_knowledge",
        "from_player": other,
        "to_player": player,
        "location": location
      });
    }
  };
  $scope.drawPlayerCard = function() {
    GameState.act({ "name": "draw_player_card" });
  };
  $scope.drawInfectionCard = function() {
    GameState.act({ "name": "draw_infection_card" });
  };
  $scope.increaseInfectionIntensity = function() {
    GameState.act({ "name": "increase_infection_intensity" });
  };
  $scope.approveAction = function() {
    GameState.act({ "name": "approve_action" });
  };
  $scope.refuseAction = function() {
    GameState.act({ "name": "refuse_action" });
  };
  $scope.currentPlayer = function() {
    return _.find(GameState.game.situation.players, function(player) {
      return player.id === $scope.user.id;
    })
  };
  $scope.locationAutocomplete = {
    options: {
      source: _.map(GameState.game.situation.locations, function(location) { return location.name; })
    }
  };
  $scope.playerToMove = { "id": $scope.user.id };
  $scope.otherPlayer = function(player) {
    return player.id !== $scope.currentPlayer().id;
  };
  $scope.action_return = GameState.action_return;
});

app.filter('reverse', function() {
  return function(list) {
    return list.slice().reverse();
  };
});

app.filter('diseaseColor', function(GameState) {
  return function(diseaseName) {
    var disease;
    var situation = GameState.game.situation;
    if (situation) {
      disease = _.find(situation.diseases, function(disease) { return disease.name == diseaseName; });
    }
    return disease ? disease.color : "white";
  };
});

app.directive('pandemicEvent', function(GameState) {
  return {
    restrict: 'E',
    scope: {
      event: '='
    },
    templateUrl: 'partials/event.html'
  };
});

app.directive('pandemicUser', function(GameState) {
  return {
    restrict: 'E',
    scope: {
      playerId: '@'
    },
    link: function(scope, element, attrs) {
      scope.user = _.find(GameState.users, function(user) {
        return user.id === scope.playerId;
      });
    },
    template: '<span data-tooltip title="ID:{{user.id}}" class="has-tip label {{user.type}}">{{user.name}}</span>'
  };
});

app.directive('pandemicRole', function(GameState) {
  return {
    restrict: 'E',
    scope: {
      role: '@'
    },
    link: function(scope, element, attrs) {
      scope.info = _.find(GameState.game.situation.roles, function(role) {
        return role.name === scope.role;
      });
    },
    template: '<span class="label secondary" style="background-color:{{info.color}}; color:black;">{{info.name}}</span>'
  };
});

app.directive('pandemicCard', function(GameState) {
  return {
    restrict: 'E',
    scope: {
      card: '='
    },
    link: function(scope, element, attrs) {
      if (scope.card.type === 'location') {
        var location = _.find(GameState.game.situation.locations, function(location) {
          return location.name === scope.card.location;
        });
        scope.disease = _.find(GameState.game.situation.diseases, function(disease) {
          return disease.name === location.disease;
        });
      } else if (scope.card.type === 'special') {
        scope.special = _.find(GameState.game.situation.specials, function(special) {
          return special.name === scope.card.special;
        });

      }
    },
    template: '<span ng-if="card.type == \'location\'"><span style="background-color:{{disease.color}}; width: 15px; height: 15px; display:inline-block; margin-right: 4px;"></span>{{card.location}}</span><span ng-if="card.type == \'special\'"><span style="width: 15px; height: 15px; display:inline-block; margin-right: 4px; font-weight: bold; text-align: center; background-color: #b3dbea; font-size: 60%">?</span>{{special.title}}</span>'
  };
});

app.directive('locationMarker', function(GameState) {
  return {
    restrict: 'E',
    replace: true,
    scope: {
      location: '='
    },
    link: function(scope, element, attrs) {
      var situation = GameState.game.situation;
      scope.locationMarker = situation.location_marker_size;

      function updatePawnLocations() {
        var players = _.filter(situation.players, function(player) {
          return player.location === scope.location.name;
        });

        scope.players = _.map(players, function(player) {
          var role = _.find(situation.roles, function(role) {
            return role.name === player.role;
          });
          return { 'color': role.color };
        });
      }

      function updateResearchCenters() {
        scope.researchCenter = _.find(situation.research_centers, function(center) {
          return center.location === scope.location.name;
        });
      }

      function updateInfections() {
        scope.infections = _.map(situation.diseases, function(disease) {
          return {
            'name': disease.name,
            'color': disease.color,
            'levels': _.times(scope.location.infections[disease.name], function(i) { return i; })
          };
        });
      }

      updatePawnLocations();
      updateResearchCenters();
      updateInfections();
      scope.$on('updatePawnLocations', function(event, args) {
        updatePawnLocations();
      });
      scope.$on('updateResearchCenters', function(event, args) {
        updateResearchCenters();
      });
      scope.$on('updateInfections', function(event, args) {
        if (args === scope.location.name) updateInfections();
      });
    },
    templateUrl: 'partials/location.svg'
  };
});

function HomeCtrl($scope, $http, $location, GameState, games) {
  $scope.games = games.data;
  GameState.setGame(null, $scope);
  $scope.createGame = function() {
    $http({method: 'POST', url: '/games'})
      .success(function(data) {
        $location.path('/games/' + data.id);
      });
  };
}

app.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.otherwise('/home');

  $stateProvider.state('root', {
    template: '<div ui-view></div>',
    resolve: {
      user: function($q, $cookies, $http) {
        var createUser = function(user) {
          $http({method: 'POST', url: '/me'})
            .success(function(data) {
              $cookies.pandemicToken = data.token;
              delete data.token;
              user.resolve(data);
            });
        }

        var user = $q.defer();
        if ($cookies.pandemicToken) {
          $http({method: 'GET', url: '/me'})
            .success(function(data) {
              user.resolve(data);
            })
            .error(function(error) {
              createUser(user);
            });
        } else {
          createUser(user);
        }
        return user.promise;
      }
    },
    controller: function($scope, user, $http) {
      $scope.user = user;
      $scope.userNameUpdated = null;
      $scope.setName = function(name) {
        $http({method: 'PUT', url: '/me', data: { 'name': name }}).success(function() {
          $scope.userNameUpdated = 'success';
          setTimeout(function() { $scope.userNameUpdated = null; }, 2000);
        }).error(function() {
          $scope.userNameUpdated = 'error';
          setTimeout(function() { $scope.userNameUpdated = null; }, 2000);
        });
      }
    }
  });

  $stateProvider.state('root.home', {
    url: '/home',
    templateUrl: 'partials/landing.html',
    resolve: {
      games: function($http) {
        return $http({method: 'GET', url: '/games'});
      }
    },
    controller: HomeCtrl,
  });

  $stateProvider.state('root.game', {
    url: '/games/:id',
    templateUrl: 'partials/game.html',
    resolve: {
      game: function($http, $stateParams) {
        return $http({method: 'GET', url: '/games/' + $stateParams.id});
      }
    },
    controller: function($scope, GameState, game) {
      GameState.setGame(game.data, $scope);
      $scope.game = GameState.game;
    }
  });
});
