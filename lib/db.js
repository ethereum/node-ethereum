// Using Binary Capable Multilevel
var multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  fs = require('fs'),
  async = require('async'),
  mkdirp = require('mkdirp');


function getSettings(done) {
  // Unpause the stdin stream:
  process.stdin.resume();

  // Recieve and Return Path Settings
  process.stdin.on('data', function(data) {
    if (data.path) {
      done(null,data);
    }
  });
}

function checkPath(done, result) {
  // Retrieve Path From getSettings Callback
  var path = result.settings.path;

  // Create DB Directories if they don't Exist
  fs.exists(path, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(path, done);
      done();
    }
  });
}

function setServers(done, result){

  // Open DB's
  var path = result.settings.path,
    b = {keyEncoding: 'binary',valueEncoding: 'binary'},
    stateDB = levelup(path + '/state',b),
    blockDB = levelup(path + '/block', b),
    detailsDB = levelup(path + '/details', b);

  // Set Servers
  function setServer(port, db) {
    net.createServer(function(con) {
      con.pipe(multilevel.server(db)).pipe(con);
    }).listen(port);
  }

  // Open Ports
  setServer(3000, stateDB);
  setServer(4000, blockDB);
  setServer(5000, detailsDB);

}

// set tasks
var tasks = {
  settings: getSettings,
  check: ['path', checkPath],
  servers: ['check', setServers]
};

// run everything
async.auto(tasks);
