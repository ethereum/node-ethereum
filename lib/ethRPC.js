const Account = require('ethereumjs-lib').Account;
const VM = require('ethereumjs-lib').VM;
const Transaction = require('ethereumjs-lib').Transaction;
const Block = require('ethereumjs-lib').Block;
const Trie = require('ethereumjs-lib').Trie;
const netDefs = require('ethereumjs-lib').networkDef;
const ethUtil = require('ethereumjs-util');
const crypto = require('crypto');
const SUPPORTED_RPC_VERSION = '2.0';
const hexStrPrefix = '0x';

module.exports = EthRPC = function(opts) {
  var self = this;
  this.app = opts.app;
  this.logFilters = {};
  this.blockFilters = { pending: {}, latest: {} };

  // update "pending" block filters
  this.app.vm.on('afterTx', function(){
    for (id in self.blockFilters.pending) {
      var pendingFilter = self.blockFilters.pending[id]
      // "For filters created with eth_newBlockFilter log objects are null."
      // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_getfilterchanges
      pendingFilter.results.push(null)
    }
  })

  // update "latest" block filters
  this.app.vm.on('block', function(){
    for (id in self.blockFilters.latest) {
      var blockFilter = self.blockFilters.latest[id]
      // "For filters created with eth_newBlockFilter log objects are null."
      // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_getfilterchanges
      blockFilter.results.push(null)
    }
  })

  // update log filters
  this.app.vm.on('logs', function(logEvent) {
    for (var id in self.logFilters) {
      var filter = self.logFilters[id];
      // check for log filter match
      if (logEvent.bloom.multiCheck(filter.topics)) {
         onLogFilterBloomMatch(filter, logEvent, id)
      }
    }
  });

  function onLogFilterBloomMatch(filter, logEvent, id) {
    logEvent.logs.forEach(function(log, logIndex) {
      //push to the filter queue
      filter.topics.forEach(function(filterTopic) {
        var logTopics = log[1];
        var match = true;

        logTopics.forEach(function(logTopic) {
          match &= (logTopic.toString('hex') === filterTopic);
        });

        if (match) {
          var transactionIndex;
          if(logEvent.block){
            transactionIndex = logEvent.block.transactions.indexOf(logEvent.tx)
          }else{
            transactionIndex = 0;  
            logEvent.block = new Block();
          }

          filter.results.push({
            // HEX String - integer of the log index position in the block.
            logIndex: ethUtil.intToHex(logIndex),
            // HEX String - integer of the transactions index position log was created from.
            transactionIndex: ethUtil.intToHex(transactionIndex),
            // HEX String - hash of the transactions this log was created from.
            transactionHash: hexStrPrefix+logEvent.tx.hash().toString('hex'),
            // HEX String - 32-byte hash of the block where this log was in. null when the log is pending.
            blockHash: logEvent.block.hash().toString('hex'),
            // HEX String - integer of the block number where this log was in. null when the log is pending.
            blockNumber: logEvent.block.header.number.toString('hex'),
            // HEX String - address from which this log originated.
            address: log[0].toString('hex'),
            // HEX String - contains the non-indexed arguments of the log.
            data: log[2].toString('hex'),
            // Array - Array of 0 to 4 HEX Strings of indexed log arguments.
            topics: logTopics.map(function(buffer) { return buffer.toString('hex') }),
          });
        }

      });
    });
  }

}

EthRPC.prototype.processRpc = function(rpcMessage, cb) {
  // parse rpc arguments
  var method = rpcMessage.method;
  var params = rpcMessage.params;
  var requestId = rpcMessage.id;
  var version = rpcMessage.jsonrpc;
  // extract relevant function
  var fn = fnForMethod(method);
  // check rpc version
  if (version !== SUPPORTED_RPC_VERSION) {
    fn = versionNotSupported;
  }
  // execute rpc method
  fn.call(this, params, function(err, result) {
    if (err) {
      cb(err);
    } else {
      cb(null, wrapResult(requestId, result));
    }
  });
};

function notImplemented(params, cb) {
  var errMessage = 'RPC Method Not Implemented.'
  console.error(errMessage)
  cb(new Error(errMessage))
}

function noSuchMethod(params, cb) {
  var errMessage = 'Unknown RPC Method.'
  console.error(errMessage)
  cb(new Error(errMessage))
}

function versionNotSupported(params, cb) {
  var errMessage = 'Unsupported RPC Version.'
  console.error(errMessage)
  cb(new Error(errMessage))
}

function wrapResult(requestId, value) {
  return {
    id: requestId,
    jsonrpc: SUPPORTED_RPC_VERSION,
    result: value
  };
}

/**
 * Fetches a block given a blockHash or A block Number. The callback is then
 * given a Trie that is set to the stateRoot of the found block if there is one
 */
EthRPC.prototype.getBlock = function(blockHash, cb) {
  blockHash = normalizeHexString(blockHash)
  var self = this;

  function createBlock(err, data) {
    if (err) return cb(err);

    var block = new Block(data);
    var stateRoot = block.header.stateRoot;
    var trie = new Trie(self.app.stateDB);

    trie.root = stateRoot;
    cb(null, trie);
  }

  if (blockHash === 'last') {
    blockhash = this.app.blockchain.meta.genesis;
  }

  if (blockHash === 'latest' || blockHash === 'pending') {
    cb(null, this.app.vm.trie);
  } else if (blockHash) {

    //lookup a hash
    if (blockHash.length === 64) {
      this.app.blockDB.get(new Buffer(blockHash, 'hex'), {
        valueEncoding: 'binary'
      }, createBlock);
    } else {
      //find block by number
      this.app.blockchain.getBlockByNumber(blockHash, createBlock);
    }
  } else {
    cb(null, this.app.vm.trie);
  }
};


//
// method implementations
//
EthRPC.prototype.eth_getBalance = function(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);

  this.getBlock(blockHash, function(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      var balance = account.balance.toString('hex');
      if (balance === '') balance = '0';
      cb(null, hexStrPrefix + balance);
    });
  });
};

EthRPC.prototype.eth_number = function(params, cb) {
  cb(null, ethUtil.bufferToInt(this.app.blockchain.head.header.number));
};

EthRPC.prototype.eth_peerCount = function(params, cb) {
  var peers;
  if (this.app.network) {
    peers = this.app.network.peers.length;
  } else {
    peers = 0;
  }
  cb(null, peers);
};

EthRPC.prototype.net_listening = function(params, cb) {
  if (this.app.network) {
    cb(null, this.app.network.listening);
  } else {
    cb(null, false);
  }
};

EthRPC.prototype.eth_setListening = function(params, cb) {
  cb(null, this.app.network.listen());
};

EthRPC.prototype.eth_getState = function(params, cb) {
  var address = normalizeHexString(params[0]);
  var key = normalizeHexString(params[1]);
  var blockHash = normalizeHexString(params[2]);
  var self = this;

  function getState(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(thaddress, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      account.getStorage(new Buffer(key, 'hex'), function(err, val) {
        if (err) return cb(err);
        cb(null, hexStrPrefix + val.toString('hex'));
      });
    });
  }

  this.getBlock(blockHash, getState);
};

EthRPC.prototype.eth_getStorageAt = function(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);
  var self = this;

  function dumpState(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);

      var account = new Account(data);
      var t = trie.copy();
      t.root = account.stateRoot;
      var stream = t.createReadStream();
      var returnVals = {};

      stream.on('data', function(data) {
        returnVals[data.key.toString('hex')] = data.value.toString('hex');
      });

      stream.on('end', function() {
        cb(null, returnVals);
      });
    });
  }

  this.getBlock(blockHash, dumpState);
};


EthRPC.prototype.eth_getTransactionCount = function(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);
  var self = this;

  function getNonce(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      cb(null, hexStrPrefix + account.nonce.toString('hex'));
    });
  }

  this.getBlock(blockHash, getNonce);
};

EthRPC.prototype.eth_getCode = function(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);
  var self = this;

  function getCode(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      account.getCode(trie, function(err, code) {
        if (err) return cb(err);
        cb(null, hexStrPrefix + code.toString('hex'));
      });
    });
  }

  this.getBlock(blockHash, getCode);
};

EthRPC.prototype.eth_signedTransact = function(params, cb) {

  var hexString = normalizeHexString(params[0])
  var enableTrace = params[1];
  var raw = new Buffer(hexString, 'hex');
  var transaction = new Transaction(raw);
  var self = this;

  var vmTrace = '';

  if(enableTrace){
    var stream = this.app.vm.logReadStream();

    stream.on('data', function(data){
      vmTrace += data;
    })
  }
  
  this.app.vm.runTx({
    tx: transaction,
    block: this.app.blockchain.head,
  }, function(err, result) {

    if (err) return cb(err);
    if (self.app.network) {
      self.app.network.broadcastTransactions([transaction]);
    }

    var returnValue;

    if (result.createdAddress) {
      returnValue = hexStrPrefix + result.createdAddress.toString('hex');
    }else{
      returnValue = hexStrPrefix + transaction.hash().toString('hex');
    }

    if(enableTrace){
      stream.end();  
      returnValue = {
        result: returnValue,
        vmTrace: vmTrace
      } 
    }

    cb(null, returnValue);
  });
};

EthRPC.prototype.eth_call = function(params, cb) {
  var txParams = params[0]
  var blockHash = normalizeHexString(params[1]);
  var self = this;

  this.getBlock(blockHash, function(err, stateTrie){

    var vm = new VM(stateTrie, self.app.blockchain);
    var transaction = new Transaction({
      to: txParams.to,
      from: txParams.from,
      value: txParams.value,
      data: txParams.data,
      gasLimit: txParams.gas,
      gasPrice: txParams.gasPrice,
    });

    //from is special unfortally and is not normilized by the setter
    transaction.from = new Buffer(normalizeHexString(txParams.from), 'hex');

    stateTrie.checkpoint();
    vm.runTx({
      tx: transaction,
      skipNonce: true
    }, function(err2, results) {
      stateTrie.revert();
      if (err) return cb(err);
      if (results.vm.returnValue) {
        cb(err || err2, hexStrPrefix + results.vm.returnValue.toString('hex'));
      } else {
        cb(err || err2, null);
      }
    });
  });
};

EthRPC.prototype.eth_getBlockByHash = function(params, cb) {
  var hash = normalizeHexString(params[0])
  this.app.blockchain.getBlock(hash, cb);
};

EthRPC.prototype.eth_getBlockByNumber = function(params, cb) {
  this.app.blockchain.getBlockByNumber(ethUtil.intToBuffer(params[0]), cb);
};

EthRPC.prototype.eth_transactionByNumber = function(params, cb) {
  this.app.blockchain.getBlockByNumber(params[0], function(err, block) {
    if (err) return cb(err);
    cb(null, block.transactions[params[1]]);
  });
};

EthRPC.prototype.eth_transactionByNumber = function(params, cb) {
  this.app.blockchain.getBlockByNumber(params[0], function(err, block) {
    if (err) return cb(err);
    cb(null, block.transactions[params[1]]);
  });
};

EthRPC.prototype.eth_uncleByNumber = function(params, cb) {
  this.app.blockchain.getBlockByNumber(params[0], function(err, block) {
    if (err) return cb(err);
    cb(null, block.uncles[params[1]]);
  });
};

EthRPC.prototype.eth_newFilter = function(params, cb) {
  var self = this;
  var id = crypto.randomBytes(8).toString('hex');
  var filter = params[0];

  var topics = filter.topic || [];
  if (filter.address) topics.push(filter.address);
  self.logFilters[id] = {
    topics: topics,
    results: [],
  };

  cb(null, id);
};

EthRPC.prototype.eth_newBlockFilter = function(params, cb) {
  var self = this;
  var id = crypto.randomBytes(8).toString('hex');
  var topic = params[0];

  if (topic === 'pending' || topic === 'latest'){
    self.blockFilters[topic][id] = { results: [] };
    cb(null, id);
  } else {
    cb(new Error('Unknown block filter type: "'+topic+'"'))
  }
};

EthRPC.prototype.eth_getFilterChanges = function(params, cb) {
  var self = this;
  var filterId = params[0];
  var filter = self.logFilters[filterId]
    || self.blockFilters.pending[filterId]
    || self.blockFilters.latest[filterId];

  if (filter) {
    cb(null, filter.results);
    filter.results = [];
  } else {
    cb(new Error('No filter for id: "'+filterId+'"'));
  }
};

EthRPC.prototype.eth_uninstallFilter = function(params, cb) {
  var filterId = params[0];
  var filter = self.logFilters[filterId]
    || self.blockFilters.pending[filterId]
    || self.blockFilters.latest[filterId];
  var exists = !!filter;
  delete self.logFilters[filterId];
  delete self.blockFilters.pending[filterId];
  delete self.blockFilters.latest[filterId];
  cb(null, exists);
};

EthRPC.prototype.eth_protocolVersion = function(params, cb) {
  cb(null, netDefs.meta.version);
}

EthRPC.prototype.eth_blockNumber = function(params, cb){
  cb(null, hexStrPrefix + this.app.blockchain.head.header.number.toString('hex'));
}


//*****
//STUBS - these are not fully implemented
//*****
EthRPC.prototype.eth_accounts = function(params, cb) {
  cb(null, []);
};

EthRPC.prototype.eth_mining = function(params, cb) {
  cb(null, false);
};

EthRPC.prototype.eth_coinbase = function(params, cb) {
  var address = nullAddress;
  cb(null, hexStrPrefix + address.toString('hex'));
};

//
// Method map
//
function fnForMethod(method) {
  var map = {
    eth_protocolVersion: EthRPC.prototype.eth_protocolVersion,
    eth_coinbase: EthRPC.prototype.eth_coinbase, //need mining to work
    eth_setCoinbase: notImplemented, //need mining to word
    eth_setListening: EthRPC.prototype.eth_setListening,
    eth_mining: EthRPC.prototype.eth_mining, //need minig to work
    eth_setMining: notImplemented, //need minig to work
    eth_gasPrice: notImplemented, //nope nope nope
    eth_accounts: EthRPC.prototype.eth_accounts, //nope nope nope
    eth_peerCount: EthRPC.prototype.eth_peerCount,
    eth_defaultBlock: notImplemented, //no
    eth_setDefaultBlock: notImplemented, //nota
    eth_number: EthRPC.prototype.eth_number,
    eth_getBalance: EthRPC.prototype.eth_getBalance,
    eth_getState: EthRPC.prototype.eth_getState, //this should be name getStorage
    eth_getStorageAt: EthRPC.prototype.eth_getStorageAt, //should be called dump storage
    eth_getTransactionCount: EthRPC.prototype.eth_getTransactionCount, // count aka nonce
    eth_getCode: EthRPC.prototype.eth_getCode,
    eth_transact: notImplemented,
    eth_signedTransact: EthRPC.prototype.eth_signedTransact,
    eth_call: EthRPC.prototype.eth_call,
    eth_getBlockByHash: EthRPC.prototype.eth_getBlockByHash, //( hash : String )
    eth_getBlockByNumber: EthRPC.prototype.eth_getBlockByNumber, //( number : Integer )
    eth_blockNumber: EthRPC.prototype.eth_blockNumber,
    eth_transactionByHash: notImplemented, //( hash : String, nth : Integer ) WTF? we cant do this because we didn't index the transactoins
    eth_transactionByNumber: EthRPC.prototype.eth_transactionByNumber, //( number : Integer, nth : Integer )
    eth_uncleByHash: notImplemented, //( hash : String, nth : Integer )
    eth_uncleByNumber: EthRPC.prototype.eth_uncleByNumber, //( number : Integer, nth : Integer )
    eth_compilers: notImplemented,
    eth_lll: notImplemented,
    eth_solidity: notImplemented,
    eth_serpent: notImplemented,
    eth_newFilter: EthRPC.prototype.eth_newFilter,
    eth_newBlockFilter: EthRPC.prototype.eth_newBlockFilter,
    eth_uninstallFilter: EthRPC.prototype.eth_uninstallFilter,
    eth_getFilterChanges: EthRPC.prototype.eth_getFilterChanges,
    eth_getFilterLogs: notImplemented,
    net_listening: EthRPC.prototype.net_listening,
    db_put: notImplemented,
    db_get: notImplemented,
    db_putString: notImplemented,
    db_getString: notImplemented,
    shh_post: notImplemented,
    shh_newIdeninty: notImplemented,
    shh_haveIdentity: notImplemented,
    shh_newGroup: notImplemented,
    shh_addToGroup: notImplemented,
    shh_newFilter: notImplemented,
    shh_uninstallFilter: notImplemented,
    shh_changed: notImplemented
  }
  return map[method] || noSuchMethod;
}

function normalizeHexString(hex) {
  if (!hex) {
    return hex
  }

  if (hex.slice(0, 2) === '0x') {
    return hex.slice(2);
  } else {
    return hex;
  }
}
