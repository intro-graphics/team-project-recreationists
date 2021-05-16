const express = require('express');
const app = express();
const http = require('http');
const socketio = require('socket.io');
const server = http.createServer(app);


app.use(express.static('.'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});


const io = socketio(server);

let players = {};

io.sockets.on('connection', function(socket){
 
	console.log(`${socket.id} connected`);
	socket.emit('setId', { id:socket.id });
	
    socket.on('disconnect', function(){
    console.log(`socket disconnect ${socket.id}`);
		socket.broadcast.emit('deletePlayer', { id: socket.id });
    	players[socket.id] = false;
		delete players[socket.id];
    });	
	
	socket.on('init', function(data){
		console.log(`socket.init ${data.model}`);
    
	});
	
	socket.on('update', function(data){
    	
    	players[socket.id] = data.player_matrix;
		
	});
	
	
});

server.listen(process.env.PORT || 5000, function(){
	console.log('listening on *:5000');
});


setInterval(function(){
  
  let packet = [];
  for (let i in players) {
    packet.push({
      id: i,
      player_matrix: players[i],
    });
  }
 
  io.emit('remote_data', packet);
  
	
}, 40);

