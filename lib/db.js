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

// Open DB and Start Listening for at given port
function startServer(done){

  // Set DB Settings
  var path = process.argv[0],
      type = process.argv[1],
      port = process.argv[2],
      b = {keyEncoding: 'binary', valueEncoding: 'binary'},
      db = levelup(path + type, b);

  // Start DB Server
  net.createServer(function(con) {
    con.pipe(multilevel.server(db)).pipe(con);
  })
  // Listen for Port
  .listen(port, function(err) {
    // Announce that ports are 'ready'
    if(!err) process.send('ready'); 
    // else console.error(err);
  });

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
