// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

//create lobby//put lobby in list
//create a lobby Object
let roomObject = {};

Object.defineProperties(roomObject, {
	roomCreator: {
		value: [],
		writable: true
	},
	roomUsers: {
		value: [],
		writable: true
	},
	bannedUsers: {
		value: [],
		writable: true
	}
});

let roomsDisplay = [];
let roomsList = {};
let users = {};
roomsList["lobby"] = roomObject;
let roomPassword = []; // key will be the room, value will be a boolean indicating whether or not there is a password

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

// Do the Socket.IO magic:
var io = socketio.listen(app);
// This callback runs when a new Socket.IO connection is established.
io.sockets.on("connection", function(socket){
	//for destroying a room and sending everyone back to the lobby
	socket.on('destroyRoom', function(data){
		// first checks if the current room is equal to the room trying to destroy
		let roomVal = data["roomVal"];
		let roomChecker = false;
		let userChecker = false;
		if (socket.room === roomVal) {
			roomChecker = true;
			if (socket.room === "lobby"){
				roomChecker = false;
				socket.emit("message_to_client", {message: "You can't destroy the lobby!"});
			}
		}
		else {
			socket.emit("message_to_client", {message: "You can't destroy a room you aren't in!"});
		}
		if (roomChecker) {
			//check now whether the creator is equal to the user trying to delete
			if (socket.username === roomsList[socket.room].roomCreator) {
					io.in(socket.room).emit('destroyer');
					//remove the room object from the roomsList dictionary
					delete roomsList[socket.room];
			}
			else {
				socket.emit("message_to_client", {message: "You can't destroy the room if you didn't create it!"});
			}
		}
	});

	//for actually kicking all users out and into the lobby
		socket.on('destroyingRoom', function(data){
			let oldRoom = socket.room;
			//splice name out of room users array
			socket.leave(oldRoom);
			//new room
			socket.room = "lobby";
			socket.join(socket.room);
			roomsList[socket.room].roomUsers.push(socket.username);
			io.to(socket.room).emit("message_to_client", {message: socket.username + " has joined " + socket.room + "!", roomer: "false"});
			socket.emit("clear_room", {message: "Welcome to " + socket.room + ", " + socket.username + "!"});
			io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
			for (let i = 0; i < roomsDisplay.length; i++) {
				if (roomsDisplay[i] === oldRoom){
					roomsDisplay.splice(i, 1);
				}
			}

			io.sockets.emit("updateRooms", {rooms: roomsDisplay});
		});

	//for sending a private message
		socket.on('privateMessage', function(data){
			let color = data["color"];
			let person = data["person"];
			let message = data["message"];
			io.in(socket.room).emit('privateMessage', {sender: socket.username, message: message, receiver: person, color: color});
		});
	//for banning users
	socket.on('banUser', function(data){
		let banOrKick = data["banOrKick"];
		socket.emit("message_to_client", {message: socket.username + " has been kicked out of " + socket.room});
		//splice name out of room users array
		let tempArray = [];
		tempArray = roomsList[socket.room].roomUsers;
		for (let i = 0; i < tempArray.length; i++) {
			if (tempArray[i] === socket.username) {
					tempArray.splice(i, 1);
			}
		}

		//old room
		if (banOrKick){
			roomsList[socket.room].bannedUsers.push(socket.username);
		}
		roomsList[socket.room].roomUsers = tempArray;
		io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
		socket.leave(socket.room);
		//new room
		socket.room = "lobby";
		socket.join(socket.room);
		roomsList[socket.room].roomUsers.push(socket.username);
		io.to(socket.room).emit("message_to_client", {message: socket.username + " has joined " + socket.room + "!", roomer: "false"});
		socket.emit("clear_room", {message: "Welcome to " + socket.room + ", " + socket.username + "!"});
		io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
	});

	//for banning users
	socket.on('banningUsers', function(data){
		let ban = data["ban"];
		let banOrKick = data["banOrKick"];
		if (socket.room === "lobby") {
			//send back a message saying this cannot be done
			socket.emit("forBanningUsers", {message: "You cannot ban users from the lobby!"});
		}
		let creatorArray = roomsList[socket.room].roomCreator;
		let username = data["user"];
		if (username === creatorArray) {
				let usersArray = roomsList[socket.room].roomUsers;
				for (let i = 0; i < usersArray.length; i++) {
					if (ban === usersArray[i]){
						//emmitted to people in room only
						io.in(socket.room).emit("receiveBannedUser", {user: ban, banOrKick: banOrKick});
					}
				}
			}
	});

	//for users to switch rooms
	socket.on('switchRooms', function(data) {
		let newRoom = data["roomVal"];
		let password = data["password"];
		let passwordValue = data["passwordValue"];
		let passwordCheck = false;

		if (passwordValue === "protected"){
			let originalPassword = roomsList[newRoom].password;
			if (password === originalPassword) {
				console.log("passwords matched");
			}
			else {
				passwordCheck = true;
				socket.emit("message_to_client", {message: "incorrect password!"});
			}
		}
		if (!passwordCheck){
			let chegg = false;
			//check if user is on banned users list and do appropriate blocks
			let checkBan = roomsList[newRoom].bannedUsers;
			for (let i = 0; i < checkBan.length; i++) {
				if (checkBan[i] === socket.username){
						chegg = true;
						socket.emit("message_to_client", {message: "You have been banned from that room unfortunately!"});
				}
			}
			if (!chegg){
				socket.emit("message_to_client", {message: socket.username + " has left " + socket.room});
				//splice user from old room by getting array from room object
				let tempArray = [];
				tempArray = roomsList[socket.room].roomUsers;
				console.log(tempArray + " this is the temp array");
				for (let i = 0; i < tempArray.length; i++) {
					if (tempArray[i] === socket.username) {
							tempArray.splice(i, 1);
					}
				}
				roomsList[socket.room].roomUsers = tempArray;
				io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
				//update new room
				socket.leave(socket.room);
				socket.join(newRoom);
				socket.room = newRoom;
				//add user to the new room, check roomer values so that when a user switches rooms, it doesn't clear for the other sockets
		    roomsList[newRoom].roomUsers.push(socket.username);
				io.to(newRoom).emit("message_to_client", {message: socket.username + " has joined " + socket.room + "!", roomer: "false"});
				socket.emit("clear_room", {message: "Welcome to " + socket.room + ", " + socket.username + "!"});
				io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
		}
	}
	});

	//check if the nickname already exists within the users in the users array now
	socket.on('setUsername', function(data) {
		let boolean = "true";
		let username = data["username"];
		//checking if username already exists
		if (username in users) {
				boolean = "false";
				socket.emit("username_set", {boolean: "false"});
				socket.emit("message_to_client", {message: username + " already exists! Please enter another nickname."});
		}
		if (boolean === "true") {
			socket.room = "lobby";
			socket.join(socket.room);
			socket.username = username;
			users[username] = username;
			roomsList[socket.room].roomUsers.push(socket.username);
			io.in(socket.room).emit("message_to_client", {message: socket.username + " has joined the " + socket.room + "!", roomer: "false"});
			socket.emit("username_set", {user:username, boolean: "true", roomPassword: roomPassword});
			//iterating through dictionary and creating an array to send
			let term = true;
			for (var key in roomsList) {
				for (let i = 0; i < roomsDisplay.length; i++) {
					if (key === roomsDisplay[i]){
							term = false;
					}
				}
				if (term) {
					roomsDisplay.push(key);
				}
			}
			io.sockets.emit("updateRooms", {rooms: roomsDisplay});
			io.in(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
		}
	});

// This callback runs when the server receives a new message from the client.
	socket.on('message_to_server', function(data) {
		console.log(socket.username + ": "+ data["message"]); // log it to the Node.JS output
		io.in(socket.room).emit("message_to_client",{message: socket.username + ": " + data["message"], roomer: "false"}); // broadcast the message to other users
	});

//This callback runs when the server recieves a new private room to create by the client
	socket.on('createPrivateRoom', function(data){
		let roomer = "true";
		let room = data["roomName"];
		let user = data["user"];
		let password = data["password"];
		if (room in roomsList) {
				console.log("room exists!");
				socket.emit("message_to_client", {message: room + " already exists!"});
				roomer = false;
			}
		if (roomer === "true") {
			//create a room object, with three properties, each value being an array
			let roomObject = {};
			Object.defineProperties(roomObject, {
				roomCreator: {
					value: user,
					writable: true
				},
				roomUsers: {
					value: [user],
					writable: true
				},
				bannedUsers: {
					value: [],
					writable: true
				},
				password: {
					value: password,
					writable: true
				}
			});
			io.in(socket.room).emit("message_to_client", {message: socket.username + " has left room!", roomer: "false"});
			//splice user from old room by getting array from room object
			let tempArray = [];
			tempArray = roomsList[socket.room].roomUsers;
			for (let i = 0; i < tempArray.length; i++) {
				if (tempArray[i] === socket.username) {
						tempArray.splice(i, 1);
				}
			}
			roomsList[socket.room].roomUsers = tempArray;
			io.to(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
			socket.leave(socket.room);
			socket.join(room);
			socket.room = room;
			roomsList[room] = roomObject;
			//pushing the room to the roomPassword array
			roomPassword.push(room);
			io.sockets.emit("checkPassword", {roomPassword: roomPassword});
			io.in(room).emit("message_to_client", {message: socket.username + " has joined " + room + "!", roomer: "true"});
			//adding current room to array so that we can send
			roomsDisplay.push(room);
			io.sockets.emit("updateRooms", {rooms: roomsDisplay});
			//to display users in the room which will just be the one person so far
			io.to(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
		}
	});


// This callback runs when the server recieves a new room to create by the client
	socket.on('createRoom', function(data) {
		let privateCheck = "true";
		if (data["password"] === "protected"){
			let roomName = data["privateRoom"];
			privateCheck = "false";
			//socket emit back to passwordRoom to prompt for a password
			socket.emit("passwordRoom", {roomName: roomName});
		}
		if (privateCheck === "true"){
			let roomer = "true";
			let room = data["newRoom"];
			let user = data["user"];
			let password = data["password"];
			if (room in roomsList) {
					console.log("room exists!");
					socket.emit("message_to_client", {message: room + " already exists!"});
					roomer = false;
				}
			if (roomer === "true") {
				//create a room object, with three properties, each value being an array
				let roomObject = {};
				Object.defineProperties(roomObject, {
					roomCreator: {
						value: user,
						writable: true
					},
					roomUsers: {
						value: [user],
						writable: true
					},
					bannedUsers: {
						value: [],
						writable: true
					}
				});
				io.in(socket.room).emit("message_to_client", {message: socket.username + " has left room!", roomer: "false"});
				//splice user from old room by getting array from room object
				let tempArray = [];
				tempArray = roomsList[socket.room].roomUsers;
				for (let i = 0; i < tempArray.length; i++) {
					if (tempArray[i] === socket.username) {
							tempArray.splice(i, 1);
					}
				}
				roomsList[socket.room].roomUsers = tempArray;
				io.to(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
				socket.leave(socket.room);
				socket.join(room);
				socket.room = room;
				roomsList[room] = roomObject;
				//don't add room to passwordRoom array
				io.in(room).emit("message_to_client", {message: socket.username + " has joined " + room + "!", roomer: "true"});
				//adding current room to array so that we can send
				roomsDisplay.push(room);
				io.sockets.emit("updateRooms", {rooms: roomsDisplay});
				//to display users in the room which will just be the one person so far
				io.to(socket.room).emit("updateUsers", {users: roomsList[socket.room].roomUsers});
			}
		}
	});
});
