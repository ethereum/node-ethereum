// Using Binary Capable Multilevel
var multilevel = require('multilevel/msgpack'),
  net = require('net'),
  levelup = require('level'),
  fs = require('fs'),
  mkdirp = require('mkdirp');


function getPath(done) {
  // Unpause the stdin stream:
  process.stdin.resume();

  // Recieve and Return Path Settings
  process.stdin.on('data', function(data) {
    if (data.path) {
      done(null,data.path);
    }
  });
}

function checkPath(done,result) {
  // Retrieve Path From getPath Callback
  var path = result.GetPath;

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

function setServers(done,result){

  // Open DB's
  var path = result.GetPath,
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
  get_path: getPath,
  check_path: ['get_path', checkPath],
  set_servers: ['check_path', setServers]
}

// run everything
async.auto(tasks);