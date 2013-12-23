var app = angular.module('pandemic', ['ui.router', 'ngCookies']);

app.factory('Board', function($http, $q) {
  var dfd = $q.defer();
  $http({method: 'GET', url: 'board.json'})
    .success(function(data) {
      dfd.resolve(data);
    })
    .error(function(data) {
      dfd.reject(data);
    });
  return dfd.promise;
});

app.controller('ChatCtrl', function($scope) {
  $scope.text = '';
  $scope.log = [];
  $scope.users = [];

  var host = window.document.location.host;
  var ws = 'ws://' + host + $scope.game.ws;
  var socket = io.connect(ws);
  socket.on('chat', function(data) {
    $scope.log.push(data);
    $scope.$apply();
  });

  socket.on('users', function(data) {
    $scope.users = data;
    $scope.$apply();
  });

  $scope.post = function(text) {
    socket.emit('post', {
      from: angular.copy($scope.user),
      text: text
    });
    $scope.text = '';
  };
});

app.controller('MapCtrl', function($scope, Board) {
  $scope.cities = [];
  Board.then(function(data) {
    $scope.cities = data.cities;
  });
});

app.controller('ActionsCtrl', function($scope, Board) {
  $scope.startGame = function() {
    console.log("Starting game...");
  }
});

app.filter('reverse', function() {
  return function(list) {
    return list.slice().reverse();
  };
});

app.filter('groupColor', function(Board) {
  var colors = {};
  Board.then(function(data) {
    colors = _.object(_.map(data.groups, function(x) { return x.name; }), _.map(data.groups, function(x) { return x.color; }));
  });
  return function(group) {
    return colors[group] || "white";
  };
});

function HomeCtrl($scope, $http, $location, games) {
  $scope.games = games.data;
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
    controller: function($scope, game) {
      $scope.game = game.data;
    }
  });
});
