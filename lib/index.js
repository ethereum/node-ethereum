const Ethereum = require('ethereumjs-lib'),
  crypto = require('crypto'),
  LevelWriteStream = require('level-writestream'),
  net = require('net'),
  log = require('npmlog'),
  async = require('async'),
  path = require('path'),
  jf = require('jsonfile'),
  defaults = require('../defaults.json'),
  upnp = require('./upnp.js'),
  mining = require('./mine.js'),
  EthAPI = require('./eth.js'),
  wsAPI = require('./wsRPC.js'),
  AccountMan = require('./accountManager'),
  cp = require('child_process'),
  multilevel = require('multilevel/msgpack');

var webui;

//a no-op
function noop(done) {
  done();
}

/**
 * @constructor
 */
var App = module.exports = function(settings) {

  this.settings = settings ? settings : {};
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

  //create API
  this.api = new EthAPI(this);
};

//attach sync function
App.prototype._sync = require('./sync.js');

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

  function setup(done) {

    // Set Children Processes Array
    self.children = self.children ? self.children : [];
    // Set Path DB if Set
    var dbpath = self.settings.path,
        dbport = self.settings.network.dbport ? self.settings.network.dbport : 4000;

    // Create Child DB
    var childDB = self.children[0] = cp.fork(path.join(__dirname,'/db.js'), [dbpath, dbport]);

    async.waterfall([
        function(done) {
          childDB.on('message', function(m) {
            if (m !== 'ready') done('Recieved Uknown Command' + m);
            else
              done();
          });
        },
        function(done) {
          jf.readFile(path.join(dbpath,'/manifest.json'), function(err, manifest) {
              var db = multilevel.client(manifest);

              // Try using Net Port..
              var con = net.connect(dbport);
              con.pipe(db.createRpcStream()).pipe(con);

              done(err, db);
          });
        },
        function(db, done) {

          // Set Servers
          var blockDB = db.sublevel('block');
          var stateDB = LevelWriteStream(db.sublevel('state'));
          var detailsDB = self.detailsDB = db.sublevel('details');

          //create the blockchain
          self.blockchain = new Ethereum.Blockchain(blockDB, detailsDB);
          //create a VM
          self.vm = new Ethereum.VM(stateDB);
          self.accountMan = new AccountMan(detailsDB);

          //start the blockchain. This will lookup last block on the blockchain.
          self.blockchain.init(done);
        }
      ], function(err) {
          // Pass Any Waterfall Errors
          done(err);
      });
  }

  //generates the genesis hash if needed
  function genesis(done) {
    var head = self.blockchain.head;

    if (!head) {
      //generate new genesis block
      self.vm.generateGenesis(function() {
        var block = new Ethereum.Block();
        block.header.stateRoot = self.vm.trie.root;
        log.info('state', 'root: ' + self.vm.trie.root.toString('hex'));
        log.info('state', 'genesis hash:' + block.hash().toString('hex'));
        log.info('rlp', block.serialize().toString('hex'));

        self.blockchain.addBlock(block, done);
      });
    } else {
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

  var tasks = {
    setup: setup,
    genesis: ['setup', genesis],
    ip: noop,
    upnp: noop,
    rcp: noop,
    id: ['setup', getId],
    //accountMan: ['setup', initAccountMan],
    network: ['ip', 'upnp', 'id', require('./networking.js').bind(self)]
  };

  if (this.settings.upnp) {
    tasks.ip = upnp.extrenalIp;
    tasks.upnp = async.apply(upnp.map, self.settings.network.port);
  }

  if (this.settings.rpc) {
    tasks.rpc = wsAPI.start.bind(self, this.settings.rpc);
  }

  //start the webui if enabled
  if (this.settings.webui) {
    webui = cp.fork('./lib/webui.js');
    webui.send({
      command: 'start',
      settings: this.settings.webui
    });
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

  var self = this;

  // Stop Each Child Process
  function killChildren() {
    self.children.forEach(function(child) {
      child.kill();
    });
  }

  var tasks = [
    killChildren,
    upnp.unmap,
    self.network.stop.bind(self.network)
  ];

  if (this.settings.rpc) {
    tasks.push(wsAPI.stop);
  }

  if (webui) {
    tasks.push(function(done) {
      webui.send.bind(this, {command: 'stop'});
      //the only message should be done
      webui.on('message', done);
    });
  }

  async.parallel(tasks, cb);

};


/**
 * Gets and serializes the entire block chain
 * @method getBlockChain
 * @param {Function} cb the callback is give an `Array` if blocks repsenting the
 * blockchain
 */
App.prototype.getBlockChain = function(cb) {

  var hash = this.blockchain.meta.genesis,
    height = this.blockchain.meta.height,
    self = this;

  this.blockchain.getBlockChain([hash], height, function(err, results) {
    //add the genesis block to the end of the results
    err = null;
    self.blockchain.getBlock(hash, function(err, genesis) {
      err = null;
      results.push(genesis);

      results = results.map(function(b) {
        return b.serialize(false);
      });

      cb(results);

    });
  });
};
