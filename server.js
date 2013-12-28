var express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  cookie = require('cookie'),
  _ = require('underscore'),
  Game = require('./game'),
  randy = require('randy'),
  gameDef = require('./initializeGame')(require('./defaultGameDef'));

var storage = require("node-persist");

storage.initSync({
  dir: 'db'
});

if (!storage.getItem('userTokens')) {
  storage.setItem('userTokens', {});
}

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

app.get('/me', function(req, res) {
  var token = req.cookies.pandemicToken;
  var userTokens = storage.getItem('userTokens');
  if (!userTokens[token]) {
    res.status(404);
  } else {
    var id = userTokens[token];
    res.json(storage.getItem('user.' + id));
  }
  res.end();
});

app.post('/me', function(req, res) {
  var token = randomId(16);
  var id = randomId(5);
  var user = { 'name': null, 'id': id, 'type': 'user' }; 
  storage.setItem('user.' + id, user); 
  var userTokens = storage.getItem('userTokens');
  userTokens[token] = id;
  storage.setItem('userTokens', userTokens);
  res.json(201, { 'name': null, 'id': id, 'type': 'user', 'token': token });
  res.end();
});

app.put('/me', function(req, res) {
  var token = req.cookies.pandemicToken;
  var userTokens = storage.getItem('userTokens');
  if (!userTokens[token]) {
    res.status(403);
  } else {
    var id = userTokens[token];
    var user = storage.getItem('user.' + id);
    user.name = req.body.name;
    storage.setItem('user.' + id, user);
    res.json(user);
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
      var userTokens = storage.getItem('userTokens');
      var userId = userTokens[token];
      var user = storage.getItem('user.' + userId);
      game.activeUsers.push(userId);
      chat.emit('users', _.map(game.activeUsers, function(id) { return storage.getItem('user.' + id); }));
      socket.emit('chat', { from: { 'name': 'Pandemic', 'type': 'system' }, text: 'Welcome to Pandemic!', date: Date.now() });
      _.each(game.log, function(item) {
        socket.emit(item.channel, item.message, errorLogger);
      });
      socket.on('post', function(message) {
        message.from = user;
        message.date = Date.now();
        game.log.push({'channel': 'chat', 'message': message});
        chat.emit('chat', message, errorLogger);
      });
      socket.on('start', function() {
        if (game.owner === userId) {
          game.state = 'in progress';
          var emitter = {
            emit: function(e) { 
              game.log.push({'channel': 'event', 'message': e});
              chat.emit('event', e); 
            }
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
        chat.emit('users', _.map(game.activeUsers, function(id) { return storage.getItem('user.' + id); }));
      });
    });
}

app.post('/games', function(req, res) {
  var token = req.cookies.pandemicToken;
  var userTokens = storage.getItem("userTokens");
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
      activeUsers: [],
      log: []
    };
    createWS(games[id]);
    res.json(201, games[id]);
  }
  res.end();
});

server.listen(8080);

var errorLogger = function(error) { if (error) { console.log('ERROR:', error); } };
