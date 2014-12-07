// Using Binary Capable Multilevel
var multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  fs = require('fs'),
  mkdirp = require('mkdirp');

function checkPath(path) {
  fs.exists(path, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(path, done);
    }
  });
}

function getPath() {
  // Unpause the stdin stream:
  process.stdin.resume();

  // Recieve and Return Path Settings
  process.stdin.on('data', function(data) {
    if (data.path) {
      checkPath(data.path);
      return data.path
    }
  });
}

function setServer(port, db) {
  net.createServer(function(con) {
    con.pipe(multilevel.server(db)).pipe(con);
  }).listen(port);
}

// Open DB's
var path = getPath();
  stateDB = levelup(path + '/state'),
  blockDB = levelup(path + '/block'),
  detailsDB = levelup(path + '/details', {keyEncoding: 'binary',valueEncoding: 'binary'});

// Open Ports
setServer(3000, stateDB);
setServer(4000, blockDB);
setServer(5000, detailsDB);


// var tasks = {
//   get_path: getPath,
//   check_path: ['get_path', checkPath],
//   set_server: ['check_path', ...]
// }
// 
// async.auto(tasks,cb)