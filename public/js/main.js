var app = angular.module('pandemic', []);

app.factory('Board', function($http, $q) {
	var dfd = $q.defer();
	$http({method: 'GET', url: 'board.json'})
		.success(function(data) {
			console.log(data);
			dfd.resolve(data);
		})
		.error(function(data) {
			dfd.reject(data);
		});
	return dfd.promise;
});

app.controller('ChatCtrl', function($scope) {
	$scope.user = { 'name': '', 'type': 'user' };
	$scope.text = '';
	$scope.log = [];
	$scope.log.push({
		from: { 'name': 'Pandemic', 'type': 'system' },
		text: 'Welcome to Pandemic!',
		date: new Date()
	});

	var host = window.document.location.host.replace(/:.*/, '');
	var ws = 'ws://' + host + ':8080/messages';
	var socket = io.connect(ws);
	socket.on('chat', function(data) {
		$scope.log.push(data);
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
