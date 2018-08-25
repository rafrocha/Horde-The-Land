const express = require('express');
const app = express();
const serv = require('http').Server(app);
const io = require('socket.io')(serv,{});

const PORT = 3000;

app.get('/', function(req, res){
  res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

serv.listen(PORT, () => {
  console.log(`Listening on PORT:${PORT}`);
});

const SOCKET_LIST = {};


const Entity = function(){
  let self = {
    x:250,
    y:250,
    id:"",
    spdX:0,
    spdY:0
  }
  self.update = function(){
    self.updatePosition();
  }
  self.updatePosition = function(){
    self.x += self.spdX;
    self.y += self.spdY;
  }

  self.getDistance = function (pt){
    return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
  }

  return self;
}

const Player = function(id){

  let self = Entity();

  self.id = id;
  self.number = "" + Math.floor(50 * Math.random());
  self.pressingRight = false;
  self.pressingLeft = false;
  self.pressingUp = false;
  self.pressingDown = false;
  self.pressingAttack = false;
  self.mouseAngle = 0;
  self.maxSpd = 10;
  self.hp = 10;
  self.maxHP = 10;
  self.score = 0;

  const super_update = self.update;

  self.update = function (){
    self.updateSpd();
    super_update();

    if(self.pressingAttack){
      self.shootBullet(self.mouseAngle);
    }
  }

  self.shootBullet = function(angle){
    let bullet = Bullet(self.id,angle);
    bullet.x = self.x;
    bullet.y = self.y;
  }

  self.updateSpd = function(){

    if(self.pressingRight) {
      self.spdX = self.maxSpd;
    } else if(self.pressingLeft){
      self.spdX = -self.maxSpd;
    } else self.spdX = 0;

    if(self.pressingUp) {
      self.spdY = -self.maxSpd;
    } else if(self.pressingDown){
      self.spdY = self.maxSpd;
    } else self.spdY = 0;

  }

  self.getInitPack = function () {
    return {
      id: self.id,
      x: self.x,
      y: self.y,
      number: self.number,
      hp: self.hp,
      maxHP: self.maxHP,
      score: self.score
    }
  }

  self.getUpdatePack = function () {
    return {
      id: self.id,
      x: self.x,
      y: self.y,
      hp: self.hp,
      score: self.score
    }
  }

  Player.list[id] = self;

  initPack.player.push(self.getInitPack());
  return self;
}

Player.list = {};
Player.onConnect = function (socket){
  const player = Player(socket.id);
  socket.on('keyPress',function(data){
    if(data.inputId === 'left')
      player.pressingLeft = data.state;
    else if(data.inputId === 'right')
      player.pressingRight = data.state;
    else if(data.inputId === 'up')
      player.pressingUp = data.state;
    else if(data.inputId === 'down')
      player.pressingDown = data.state;
    else if(data.inputId === 'attack')
      player.pressingAttack = data.state;
    else if(data.inputId === 'mouseAngle')
      player.mouseAngle = data.state;
  });

  socket.emit('init', {
    selfId: socket.id,
    player: Player.getAllInitPack(),
    bullet: Bullet.getAllInitPack()
  });
}

Player.getAllInitPack = function() {
  let players = [];
  for(let i in Player.list){
    players.push(Player.list[i].getInitPack());
  } return players;
}

Player.onDisconnect = function(socket){
  delete Player.list[socket.id];
  removePack.player.push(socket.id);
}

Player.updateAll = function(){
  let pack = [];
  for(let i in Player.list){
    let player = Player.list[i];
    player.update();
    pack.push(player.getUpdatePack());
  };
  return pack;
};


const Bullet = function(parent, angle){
  let self = Entity();
  self.id = Math.random();
  self.spdX = Math.cos(angle/180*Math.PI) * 10;
  self.spdY = Math.sin(angle/180*Math.PI) * 10;
  self.parent = parent;
  self.timer = 0;
  self.toRemove = false;
  let super_update = self.update;

  self.update = function(){
    if(self.timer++ > 100){
      self.toRemove = true;
    }
    super_update();

    for (let i in Player.list){
      let p = Player.list[i];
      if(self.getDistance(p) < 32 && self.parent!== p.id){
        p.hp -= 1;

        if (p.hp <= 0) {
          let shooter = Player.list[self.parent];
          if (shooter) {
            shooter.score += 1;
          }
          p.hp = p.maxHP;
          p.x = Math.random() * 500;
          p.y = Math.random() * 500;
        }

        self.toRemove = true;
      }
    }
  }

    self.getInitPack = function () {
    return {
      id: self.id,
      x: self.x,
      y: self.y
    }
  }

  self.getUpdatePack = function () {
    return {
      id: self.id,
      x: self.x,
      y: self.y
    }
  }

  Bullet.list[self.id] = self;
  initPack.bullet.push(self.getInitPack())
  return self;
}

Bullet.list = {};

Bullet.updateAll = function(){

  let pack = [];
  for(let i in Bullet.list){
    let bullet = Bullet.list[i];
    bullet.update();
    if(bullet.toRemove){
      delete Bullet.list[i];
      removePack.bullet.push(bullet.id);
    }
    else {
      pack.push(bullet.getUpdatePack());
    }
  };
  return pack;
};

Bullet.getAllInitPack = function() {
  let bullets = [];
    for(let i in Bullet.list){
      bullets.push(Bullet.list[i].getInitPack());
    } return bullets;
}


let DEBUG = true;

let USERS = {
  "bob":"asd",
  "peter":"qwe",
  "mary":"zxc"
}

let isValidPassword = function(data){
  return USERS[data.username] === data.password;
}

io.sockets.on('connection', function(socket){

  socket.id= Math.random();
  SOCKET_LIST[socket.id] = socket

  socket.on('signIn', function(data){
    if(isValidPassword(data)){
    Player.onConnect(socket);
    socket.emit('signInResponse', {success:true});
    } else {
      socket.emit('signInResponse', {success:false});
    }
  })

  //outputs on TERMINAL when a Player joins the game
  console.log('New player online');


  socket.on('sendMsgToServer', function(data){
    let playerName = (""+socket.id).slice(2,7);
    for(let i in SOCKET_LIST){
      SOCKET_LIST[i].emit('addToChat', playerName + ': ' + data);
    }
  });

  socket.on('evalServer', function(data){
    if(!DEBUG){
      return;
    } else {
    let res = eval(data);
    socket.emit('evalAnswer', res);
    }
  });


  socket.on('disconnect', function(){
    delete SOCKET_LIST[socket.id];
    Player.onDisconnect(socket);
  });

});

let initPack = {player: [], bullet: []};
let removePack = {player:[], bullet: []};

setInterval(function(){
  let pack = {
    player: Player.updateAll(),
    bullet: Bullet.updateAll()
  }

  for(let i in SOCKET_LIST){
    let socket = SOCKET_LIST[i];
    socket.emit('init',initPack);
    socket.emit('update',pack);
    socket.emit('remove',removePack);
  }

  initPack.player = [];
  initPack.bullet = [];
  removePack.player = [];
  removePack.bullet = [];

}, 1000/25);
