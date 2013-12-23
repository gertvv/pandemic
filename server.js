var express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  cookie = require('cookie');

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

function createWS(url) {
  var chat = io.of(url)
    .on('connection', function(socket) {
      console.log();
      var token = cookie.parse(socket.handshake.headers.cookie).pandemicToken;
      var user = users[userTokens[token]];
      socket.emit('chat', { from: { 'name': 'Pandemic', 'type': 'system' }, text: 'Welcome to Pandemic!', date: Date.now() });
      socket.on('post', function(message) {
        message.from = user;
        message.date = Date.now();
        chat.emit('chat', message, errorLogger);
      });
    });
}

app.post('/games', function(req, res) {
  var id = randomId(5);
  games[id] = { id: id, title: 'Pandemic Game', _self: '/games/' + id, ws: '/games/' + id };
  createWS(games[id].ws);
  res.json(201, games[id]);
  res.end();
});

server.listen(8080);

var errorLogger = function(error) { if (error) { console.log('ERROR:', error); } };
