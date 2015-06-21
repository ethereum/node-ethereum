const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const Ethereum = require('ethereumjs-lib');
const manifest = require('./manifest.json');
const multilevel = require('multilevel');
const LevelWriteStream = require('level-writestream');
const log = require('npmlog');
const async = require('async');
const mkdirp = require('mkdirp');
const defaults = require('../defaults.json');
const upnp = require('./upnp.js');
const mining = require('./mine.js');
const EthRPC = require('./rpc/index.js');
const HttpRpc = require('./rpc/server/http.js');
const WsRpc = require('./rpc/server/ws.js');
const blockProcesser = require('./blockProcesser.js');
var genesisAllotments = require('ethereum-common').allotments;
const networking = require('./networking.js');

var dbConnection;
var dbServer;

//a no-op
function noop(done) {
  done();
}

/**
 * @constructor
 */
var App = module.exports = function(settings) {

  this.blockProcesser = new BlockProcesser(this);
  this.settings = settings || {};
  this.plugins = {};
  this.log = log;

  //a queue of transaction that have yet to be inculded in the blockchain
  this.pendingTxs = [];
  this.isSyncing = false;

  //set the default path for the config and database files
  defaults.path = process.env.HOME + '/.ethereum/node';

  //add the defaults
  for (var prop in defaults) {
    if (this.settings[prop] === void 0) this.settings[prop] = defaults[prop];
  }
};

//attach mining functions
App.prototype.startMining = mining.start;
App.prototype.stopMining = mining.stop;
App.prototype.toggleMining = mining.toggle;

/**
 * Starts the client
 * @method start
 * @param {Function} cb a callback
 */
App.prototype.start = function(cb) {

  var self = this;

  /**
   * Checks the for the db folder and creates a new folder if it doesn't exist
   * @method checkPath"
   * @param {Function} done
   * @private
   */
  function checkPath(done) {
    fs.exists(self.settings.path, function(exists) {
      if (exists) {
        done();
      } else {
        mkdirp(self.settings.path, done);
      }
    });
  }

  function setup(done) {
    //open DBs
    var db = multilevel.client(manifest);
    dbConnection = net.connect(self.settings.db.port);
    dbConnection.pipe(db.createRpcStream()).pipe(dbConnection);

    var stateDB = self.stateDB = LevelWriteStream(db.sublevel('state'));
    var blockDB = self.blockDB = db.sublevel('blocks');
    var detailsDB = self.detailsDB = db.sublevel('details');
    var peersDB = self.peersDB = db.sublevel('peers');

    //create the blockchain
    self.blockchain = new Ethereum.Blockchain(blockDB, detailsDB);
    //create a VM
    self.vm = new Ethereum.VM(stateDB, self.blockchain);

    //account manager doesn't do anything yet
    // self.accountMan = new AccountMan(detailsDB);
    self.rpc = new EthRPC(app);

    //start the blockchain. This will lookup last block on the blockchain.
    self.blockchain.init(done);
  }

  //generates the genesis hash if needed
  function genesis(done) {
    var head = self.blockchain.head;

    if (!head) {
      //generate new genesis block
      if(self.settings.allotments) genesisAllotments = self.settings.allotments;
      log.info('state', 'using provided genesisAllotments.')

      self.vm.generateGenesis(genesisAllotments, function() {
        var block = new Ethereum.Block();
        block.header.stateRoot = self.vm.trie.root;
        log.info('state', 'root: ' + self.vm.trie.root.toString('hex'));
        log.info('state', 'genesis hash:' + block.hash().toString('hex'));
        log.info('rlp', block.serialize().toString('hex'));
        self.blockchain.addBlock(block, done);
      });
    } else {
      self.vm.trie.root = head.header.stateRoot;
      log.info('state', 'starting with state root of: ' + head.header.stateRoot.toString('hex') +
        ' height:' + head.header.number.toString('hex'));

      done();
    }
  }

  //get the unquie id of the client. If there isn't one then generate one
  function getId(done) {
    self.detailsDB.get('id', function(err, id) {
      if (!id) {
        var hash = crypto.createHash('sha512');
        hash.update((Math.random())
          .toString());

        id = hash.digest('hex');

        self.detailsDB.put('id', id, function(err) {
          done(err, id);
        });

      } else {
        done(err, id);
      }
    });
  }

  // XHR RPC Server
  function startHttpRpcServer(done) {
    self.xhrRpc = new HttpRpc(self.rpc);
    self.xhrRpc.start(self.settings.rpc.xhr, done);
  }

  // WS RPC Server
  function startWsRpcServer(done) {
    self.wsRpc = new WsRpc(self.rpc);
    self.wsRpc.start(self.settings.rpc.ws, done);
  }

  var tasks = {
    checkPath: checkPath,
    startDB: noop,
    setup: ['checkPath', 'startDB', setup],
    genesis: ['setup', genesis],
    ip: noop,
    upnp: noop,
    rcp: noop,
    id: ['setup', getId],
    //accountMan: ['setup', initAccountMan],
    network: noop,
  };

  if (this.settings.network) {
    tasks.network = ['ip', 'upnp', 'id', networking.bind(self)];

    if (this.settings.upnp) {
      tasks.ip = upnp.extrenalIp;
      tasks.upnp = async.apply(upnp.map, self.settings.network.port);
    }
  }

  if (this.settings.rpc) {
    if(this.settings.rpc.xhr) tasks.startHttpRpcServer = ['setup', startHttpRpcServer];
    if(this.settings.rpc.ws) tasks.startWsRpcServer = ['setup', startWsRpcServer];
  }

  //start the db server
  if(this.settings.dbServer){
    tasks.startDB = function startDBserver(done){
      dbServer = cp.fork(path.join( __dirname, '/../bin/dbServer'), [ self.settings.path, self.settings.db.port], {execArgv: []} );
      dbServer.on('message', function(){
        done();
      });
    };
  }

  //run everything
  async.auto(tasks, cb);
};

/**
 * Stops everything every
 * @method stop
 * @param {Function} cb calls this callback when everything is done
 */
App.prototype.stop = function(cb) {

  var self = this,
    tasks = [
      upnp.unmap,
    ];

  if(this.settings.network){
    tasks.push(self.network.close.bind(self.network));
  }

  dbConnection.end();

  if (this.settings.rpc) {
    if(this.settings.rpc.ws) tasks.push(self.wsRpc.stop.bind(self.wsRpc));
    if(this.settings.rpc.xhr) tasks.push(self.xhrRpc.stop.bind(self.xhrRpc));
  }

  async.parallel(tasks, cb);
};
