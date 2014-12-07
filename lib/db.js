<<<<<<< HEAD
// Use Binary Capable Multilevel
const multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  sublevel = require('level-sublevel'),
  fs = require('fs'),
  async = require('async'),
  shoe = require('shoe'),
  mkdirp = require('mkdirp');

// Create DB Directories if they don't Exist
function checkPath(done) {
=======
// Using Binary Capable Multilevel
var multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  fs = require('fs'),
  mkdirp = require('mkdirp');
>>>>>>> FRudimentary Fix

  // Retrieve Path From getSettings Callback
  var dbpath = process.argv[2];

  fs.exists(dbpath, function(exists) {
    if (exists) {
      done();
    } else {
<<<<<<< HEAD
      mkdirp(dbpath, done);
      done();
=======
      mkdirp(path, done);
>>>>>>> FRudimentary Fix
    }
  });
}

<<<<<<< HEAD
// Open DB and Start Listening for at given port
function startServer(done){

  // Set DB Settings
  var dbpath = process.argv[2],
      b = {keyEncoding: 'binary', valueEncoding: 'binary'},
      db = sublevel(levelup(path + '/db', b)),
      // Create/Open State Sublevels
      stateDB = db.sublevel('state'),
      // Create Block Sublevel
      blockdb = db.sublevel('block'),
      // Create Details Sublevel
      detailsdb = db.sublevel('details');

  // // write manifest for multilevel when using sublevel
  multilevel.writeManifest(db,dbpath + '/manifest.json');

  var sock = shoe(function (stream) {
    stream.pipe(multilevel.server(db)).pipe(stream);
=======
function getPath() {
  // Unpause the stdin stream:
  process.stdin.resume();

  // Recieve and Return Path Settings
  process.stdin.on('data', function(data) {
    if (data.path) {
      checkPath(data.path);
      return data.path
    }
>>>>>>> FRudimentary Fix
  });

  sock.install(net.createServer(),'ChildDB');

  // Finish
  done();
}

function notifyReady (done) {
  process.send('ready');
  done();
}

<<<<<<< HEAD
// set tasks
var tasks = {
  check: checkPath,
  start: ['check', startServer],
  ready: notifyReady
};

// run everything
async.auto(tasks);
=======
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
>>>>>>> FRudimentary Fix
