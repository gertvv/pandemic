var express = require('express'),
  app = express(),
    server = require('http').createServer(app),
  io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));

server.listen(8080);

var errorLogger = function(error) { if (error) { console.log('ERROR:', error); } };

var chat = io.of('/messages')
  .on('connection', function(socket) {
  socket.emit('chat', { from: { 'name': 'Pandemic', 'type': 'system' }, text: 'Welcome to Pandemic!', date: Date.now() });
  socket.on('post', function(message) {
    message.date = Date.now();
    chat.emit('chat', message, errorLogger);
  });
});
