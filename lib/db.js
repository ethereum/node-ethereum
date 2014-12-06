// Using Binary Capable Multilevel
var multilevel = require('multilevel/msgpack');
var net = require('net');
var levelup = require('level');

/**
 * Checks the for the db folder and creates a new folder if it doesn't exist
 * @method checkPath
 * @param {Function} done
 * @private
 */
function checkPath(path) {
  fs.exists(path, function(exists) {
    if (exists) {
      done();
    } else {
      mkdirp(self.settings.path, done);
    }
  });
}

function setServer (port,db) {
  net.createServer(function(con) {
    con.pipe(multilevel.server(db)).pipe(con);
  }).listen(port);
}

function getPath(){
  // Unpause the stdin stream:
  process.stdin.resume();

  // Recieve and Return Path Settings
  process.stdin.on('data', function (data) {
      if (data.path){
        checkPath(data.path);
        return data.path
      }
  });
}

//open DBs
var path = getPath(),
  stateDB = levelup(path + '/state'),
  blockDB = levelup(path + '/block'),
  detailsDB = levelup(path + '/details', { keyEncoding: 'binary', valueEncoding: 'binary' });

// Open Ports
setServer(3000,stateDB);
setServer(4000,blockDB);
setServer(5000,detailsDB);

