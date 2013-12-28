var app = angular.module('pandemic', ['ui.router', 'ngCookies']);

app.factory('GameState', function() {
  function handleGameEvent(e) {
    if (e.event_type == "initial_situation") {
      console.log(e);
      service.game.state = "in progress";
      service.game.situation = e.situation;
    }
    if (e.event_type == "infect") {
      var location = _.find(service.game.situation.locations,
        function(location) { return location.name === e.location; });
      location.infections[e.disease]++;
      $scope.$broadcast("updateInfections", location.name);
      console.log(location);
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

  function start() {
    socket.emit('start');
  };

  var service = {
    setGame: setGame,
    game: {},
    log: [],
    users: [],
    post: post,
    start: start
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

app.controller('ActionsCtrl', function($scope, GameState) {
  $scope.users = GameState.users;
  $scope.startGame = function() {
    GameState.start();
  }
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

app.directive('infectionsMarker', function(GameState) {
  return {
    restrict: 'E',
    transclude: true,
    replace: true,
    scope: {
      location: '='
    },
    link: function(scope, element, attrs) {
      var situation = GameState.game.situation;
      scope.locationMarker = situation.location_marker_size;

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
    templateUrl: 'partials/infections.svg'
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
