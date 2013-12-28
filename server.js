var express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  cookie = require('cookie'),
  _ = require('underscore'),
  Game = require('./game'),
  randy = require('randy'),
  gameDef = require('./initializeGame')(require('./defaultGameDef'));


app.use(express.static(__dirname + '/public'));
app.use(express.cookieParser());
app.use(express.bodyParser());

function randomId(size, prefix) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for(var i = 0; i < size; i++ ) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return prefix ? prefix + text : text;
}

var userTokens = {};
var users = {};

app.get('/me', function(req, res) {
  var token = req.cookies.pandemicToken;
  if (!userTokens[token]) {
    res.status(404);
  } else {
    var id = userTokens[token];
    res.json(users[id]);
  }
  res.end();
});

app.post('/me', function(req, res) {
  var token = randomId(16);
  var id = randomId(5);
  var user = { 'name': null, 'id': id, 'type': 'user' }; 
  users[id] = user;
  userTokens[token] = id;
  res.json(201, { 'name': null, 'id': id, 'type': 'user', 'token': token });
  res.end();
});

app.put('/me', function(req, res) {
  var token = req.cookies.pandemicToken;
  if (!userTokens[token]) {
    res.status(403);
  } else {
    var id = userTokens[token];
    console.log(users[id], req.body);
    users[id].name = req.body.name;
    res.json(users[id]);
  }
  res.end();
});

var games = {};

app.get('/games', function(req, res) {
  res.json(games);
  res.end();
});

app.get('/games/:id?', function(req, res) {
  var id = req.params.id;
  if (games[id]) {
    res.json(games[id]);
    res.end();
  } else {
    res.status(404);
    res.end();
  }
});

function createWS(game) {
  var chat = io.of(game.ws)
    .on('connection', function(socket) {
      var token = cookie.parse(socket.handshake.headers.cookie).pandemicToken;
      var userId = userTokens[token];
      var user = users[userId];
      game.activeUsers.push(userId);
      chat.emit('users', _.map(game.activeUsers, function(id) { return users[id]; }));
      socket.emit('chat', { from: { 'name': 'Pandemic', 'type': 'system' }, text: 'Welcome to Pandemic!', date: Date.now() });
      socket.on('post', function(message) {
        message.from = user;
        message.date = Date.now();
        chat.emit('chat', message, errorLogger);
      });
      socket.on('start', function() {
        if (game.owner === userId) {
          game.state = 'in progress';
          var emitter = {
            emit: function(e) { chat.emit('event', e); }
          }
          game.engine = new Game(gameDef, game.activeUsers, { "number_of_epidemics": 4 }, emitter, randy);
          game.engine.setup();
        }
      });
      socket.on('act', function(action) {
        game.engine.act(userId, action);
      });
      socket.on('disconnect', function() {
        game.activeUsers = _.without(game.activeUsers, userId);
        chat.emit('users', _.map(game.activeUsers, function(id) { return users[id]; }));
      });
    });
}

app.post('/games', function(req, res) {
  var token = req.cookies.pandemicToken;
  if (!userTokens[token]) {
    res.status(403);
  } else {
    var userId = userTokens[token];
    var id = randomId(5);
    games[id] = {
      id: id,
      owner: userId,
      state: 'lobby',
      title: 'Pandemic Game',
      _self: '/games/' + id,
      ws: '/games/' + id,
      activeUsers: []
    };
    createWS(games[id]);
    res.json(201, games[id]);
  }
  res.end();
});

server.listen(8080);

var errorLogger = function(error) { if (error) { console.log('ERROR:', error); } };
