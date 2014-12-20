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
  var path = process.argv[2];

  fs.exists(path, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(path, done);
      done();
    }
  });
}

// Open DB and Start Listening for at given port
function startServer(done){

  // Set DB Settings
  var path = process.argv[2],
      b = {keyEncoding: 'binary', valueEncoding: 'binary'},
      db = sublevel(levelup(path, b)),
      // Create/Open State Sublevels
      statedb = db.sublevel('state'),
      // Create Block Sublevel
      blockdb = db.sublevel('block'),
      // Create Details Sublevel
      detailsdb = db.sublevel('details');

  // // write manifest for multilevel when using sublevel
  multilevel.writeManifest(db,path+'/manifest.json');

  var sock = shoe(function (stream) {
    stream.pipe(multilevel.server(db)).pipe(stream);
  });

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