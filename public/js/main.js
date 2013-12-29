var app = angular.module('pandemic', ['ui.router', 'ngCookies']);

app.factory('GameState', function() {
  function handleGameEvent(e) {
    if (e.event_type === "initial_situation") {
      console.log(e);
      service.game.state = "in progress";
      service.game.situation = e.situation;
    }
    if (e.event_type === "infect") {
      var location = _.find(service.game.situation.locations,
        function(location) { return location.name === e.location; });
      location.infections[e.disease]++;
      var disease = _.find(service.game.situation.diseases,
        function(disease) { return disease.name === e.disease; });
      disease.cubes--;
      $scope.$broadcast("updateInfections", location.name);
    }
    if (e.event_type === "outbreak") {
      service.game.situation.outbreak_count++;
    }
    if (e.event_type === "infection_rate_increased") {
      service.game.situation.infection_rate_index++;
    }
    if (e.event_type === "state_change") {
      service.game.situation.state = e.state;
    }
  }

  function setGame(game, scope) {
    $scope = scope;
    if (socket) {
      //socket.close();
      init();
    }
    if (game) {
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
          handleGameEvent(data);
          service.log.push({"type": "event", "data": data});
        });
      });

      socket.on('users', function(data) {
        $scope.$apply(function() {
          service.users.length = 0;
          service.users.push.apply(service.users, data);
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
    post: post,
    start: start,
    act: act
  };
  var socket, $scope;

  function init() {
      service.game = {};
      service.log = [];
      service.users = [];
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
  $scope.drawPlayerCard = function() {
    GameState.act({ "name": "draw_player_card" });
  };
  $scope.drawInfectionCard = function() {
    GameState.act({ "name": "draw_infection_card" });
  };
  $scope.increaseInfectionIntensity = function() {
    GameState.act({ "name": "increase_infection_intensity" });
  };
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

      var players = _.filter(situation.players, function(player) {
        return player.location === scope.location.name;
      });

      scope.players = _.map(players, function(player) {
        var role = _.find(situation.roles, function(role) {
          return role.name === player.role;
        });
        return { 'color': role.color };
      });

      scope.researchCenter = _.find(situation.research_centers, function(center) {
        return center.location === scope.location.name;
      });


      function updateInfections() {
        scope.infections = _.map(situation.diseases, function(disease) {
          return {
            'name': disease.name,
            'color': disease.color,
            'levels': _.times(scope.location.infections[disease.name], function(i) { return i; })
          };
        });
      }

      updateInfections();
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
