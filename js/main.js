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
	$scope.post = function(text) {
		$scope.log.push({
			from: angular.copy($scope.user),
			text: text,
			date: new Date()
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
