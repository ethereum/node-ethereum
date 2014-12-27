// Use Binary Capable Multilevel
const multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  sublevel = require('level-sublevel'),
  fs = require('fs'),
  async = require('async'),
  shoe = require('shoe'),
  mkdirp = require('mkdirp');

/**
 * Recieve three arguments from parent (Strings):
 * 1. Database Storage Path
 * 2. Database Name/Type
 * 3. Server Port to Listen To
*/

// Create DB Directories if they don't Exist
function checkPath(done) {

  // Retrieve Path From getSettings Callback
  var dbpath = process.argv[2];

  fs.exists(dbpath, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(dbpath, done);
      done();
    }
  });
}

// Open DB and Start Listening for at given port
function startServer(done){

  // Set DB Settings
  var dbpath = process.argv[2],
      b = {keyEncoding: 'binary', valueEncoding: 'binary'},
      db = sublevel(levelup(dbpath, b));

  // Create/Open State Sublevels
  db.sublevel('block');
  db.sublevel('state');
  db.sublevel('details');

  // // write manifest for multilevel when using sublevel
  multilevel.writeManifest(db,dbpath + '/manifest.json');

  var sock = shoe(function (stream) {
    stream.pipe(multilevel.server(db)).pipe(stream);
  });

  sock.install(net.createServer(),'ChildDB');

  // Finish
  done();
}

function notifyReady (done) {
  process.send('ready');
  done();
}

// set tasks
var tasks = {
  check: checkPath,
  start: ['check', startServer],
  ready: notifyReady
};

// run everything
async.auto(tasks);
