// Use Binary Capable Multilevel
const multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  fs = require('fs'),
  async = require('async'),
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
  var path = process.argv[0];

  fs.exists(path, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(path, done);
      done();
    }
  });
}

// Create Server
function createServer(db,port) {
  // Start DB Server
  var server = net.createServer(function(con) {
    con.pipe(multilevel.server(db)).pipe(con);
  }).listen(port);
}

// Open DB and Start Listening for at given port
function startServer(done){

  // Set DB Settings
  var path = process.argv[0],
      b = {keyEncoding: 'binary', valueEncoding: 'binary'},
      stateDB = levelup(path + '/state', b),
      blockDB = levelup(path + '/block', b),
      detailsDB = levelup(path + '/details', b);

  // Create & Start Servers
  createServer(stateDB, 8888);
  createServer(blockDB, 8008);
  createServer(detailsDB, 8018);

  // Finish
  done();
}

// set tasks
var tasks = {
  check: checkPath,
  start: ['check', startServer]
};

// run everything
async.auto(tasks);
