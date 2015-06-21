const Account = require('ethereumjs-lib').Account;
const VM = require('ethereumjs-lib').VM;
const Transaction = require('ethereumjs-lib').Transaction;
const ethUtil = require('ethereumjs-util');
const crypto = require('crypto');
const hexStrPrefix = '0x';

module.exports = {
  getBlockByHash: getBlockByHash,
  getBlockByNumber: getBlockByNumber,
  transactionByNumber: transactionByNumber,
  uncleByNumber: uncleByNumber,
  newFilter: newFilter,
  newBlockFilter: newBlockFilter,
  getFilterChanges: getFilterChanges,
  getFilterLogs: getFilterLogs,
  uninstallFilter: uninstallFilter,
  protocolVersion: protocolVersion,
  blockNumber: blockNumber,
  getBalance: getBalance,
  number: number,
  peerCount: peerCount,
  setListening: setListening,
  getState: getState,
  getStorageAt: getStorageAt,
  getTransactionCount: getTransactionCount,
  getCode: getCode,
  signedTransact: signedTransact,
  call: call,
  // STUBS
  accounts: accounts,
  mining: mining,
  coinbase: coinbase,
};


function getBlockByHash(params, cb) {
  var hash = normalizeHexString(params[0])
  this.blockchain.getBlock(hash, cb);
}

function getBlockByNumber(params, cb) {
  this.blockchain.getBlockByNumber(ethUtil.intToBuffer(params[0]), cb);
}

function transactionByNumber(params, cb) {
  this.blockchain.getBlockByNumber(params[0], function(err, block) {
    if (err) return cb(err);
    cb(null, block.transactions[params[1]]);
  });
}

function uncleByNumber(params, cb) {
  this.blockchain.getBlockByNumber(params[0], function(err, block) {
    if (err) return cb(err);
    cb(null, block.uncles[params[1]]);
  });
}

function newFilter(params, cb) {
  var self = this;
  var id = crypto.randomBytes(8).toString('hex');
  var filter = params[0];
  
  var topics = filter.topics || [];
  topics = topics
  .filter(function(item) {
    return !!item;
  })
  .map(function(t) {
    return normalizeHexString(t);
  })

  if (filter.address) topics.push(normalizeHexString(filter.address));
  self._logFilters[id] = {
    topics: topics,
    results: [],
  };

  cb(null, id);

}

function newBlockFilter(params, cb) {
  var self = this;
  var id = crypto.randomBytes(8).toString('hex');
  var topic = params[0];

  if (topic === 'pending' || topic === 'latest') {
    self._blockFilters[topic][id] = { results: [] };
    cb(null, id);
  } else {
    cb(new Error('Unknown block filter type: "'+topic+'"'))
  }
}

function getFilterChanges(params, cb) {
  var self = this;
  var filterId = params[0];
  var filter = self._logFilters[filterId]
    || self._blockFilters.pending[filterId]
    || self._blockFilters.latest[filterId];

  if (filter) {
    cb(null, filter.results);
    filter.results = [];
  } else {
    cb(new Error('No filter for id: "'+filterId+'"'));
  }
}

function getFilterLogs(params, cb) {
  var self = this;
  var filterId = params[0];
  var filter = self._logFilters[filterId]
    || self._blockFilters.pending[filterId]
    || self._blockFilters.latest[filterId];

  if (filter) {
    cb(null, filter.results);
  } else {
    cb(new Error('No filter for id: "'+filterId+'"'));
  }
}

function uninstallFilter(params, cb) {
  var filterId = params[0];
  var filter = self._logFilters[filterId]
    || self._blockFilters.pending[filterId]
    || self._blockFilters.latest[filterId];
  var exists = !!filter;
  delete self._logFilters[filterId];
  delete self._blockFilters.pending[filterId];
  delete self._blockFilters.latest[filterId];
  cb(null, exists);
}

function protocolVersion(params, cb) {
  cb(null, this.protocolVersion);
}

function blockNumber(params, cb) {
  cb(null, hexStrPrefix + this.blockchain.head.header.number.toString('hex'));
}


function getBalance(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);

  this.getStateAtBlock(blockHash, function(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      var balance = account.balance.toString('hex');
      if (balance === '') balance = '0';
      cb(null, hexStrPrefix + balance);
    });
  });
}

function number(params, cb) {
  cb(null, ethUtil.bufferToInt(this.blockchain.head.header.number));
}

function peerCount(params, cb) {
  var peers;
  if (this.network) {
    peers = this.network.peers.length;
  } else {
    peers = 0;
  }
  cb(null, peers);
}

function setListening(params, cb) {
  if (this.network) {
    cb(null, this.network.listen());
  } else {
    cb(null, false);
  }
}

function getState(params, cb) {
  var address = normalizeHexString(params[0]);
  var key = normalizeHexString(params[1]);
  var blockHash = normalizeHexString(params[2]);
  var self = this;

  function getStorage(err, trie) {
    if (err) return cb(err);
    trie.get(new Buffer(address, 'hex'), function(err, data) {
      if (err) return cb(err);
      var account = new Account(data);
      account.getStorage(new Buffer(key, 'hex'), function(err, val) {
        if (err) return cb(err);
        cb(null, hexStrPrefix + val.toString('hex'));
      });
    });
  }

  this.getStateAtBlock(blockHash, getStorage);
}

function getStorageAt(params, cb) {
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

  this.getStateAtBlock(blockHash, dumpState);
}

function getTransactionCount(params, cb) {
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

  this.getStateAtBlock(blockHash, getNonce);
}

function getCode(params, cb) {
  var address = normalizeHexString(params[0]);
  var blockHash = normalizeHexString(params[1]);
  var self = this;

  function getCodeAtBlock(err, trie) {
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

  this.getStateAtBlock(blockHash, getCodeAtBlock);
}

function signedTransact(params, cb) {

  var hexString = normalizeHexString(params[0])
  var enableTrace = params[1];
  var raw = new Buffer(hexString, 'hex');
  var transaction = new Transaction(raw);
  var self = this;

  if (enableTrace) {
    var vmTrace = '';
    var stream = this.vm.logReadStream();

    stream.on('data', function(data){
      vmTrace += data;
    })
  }
  
  this.vm.runTx({
    tx: transaction,
    block: this.blockchain.head
  }, function(err, result) {

    // cleanup
    if (enableTrace) {
      stream.end();
    }

    // abort on error
    if (err) return cb(err);

    if (self.network) {
      self.network.broadcastTransactions([transaction]);
    }

    // process results
    var returnValue;
    if (result.createdAddress) {
      returnValue = hexStrPrefix + result.createdAddress.toString('hex');
    } else {
      returnValue = hexStrPrefix + transaction.hash().toString('hex');
    }

    if (enableTrace) {
      returnValue = {
        result: returnValue,
        vmTrace: vmTrace,
      } 
    }

    cb(null, returnValue);
  });
}

function call(params, cb) {
  var txParams = params[0]
  var blockHash = normalizeHexString(params[1]);
  var enableTrace = params[2];
  var self = this;

  this.getStateAtBlock(blockHash, function(err, stateTrie){
    if (err) return cb(err);

    var vm = new VM(stateTrie, self.blockchain);
    var transaction = new Transaction({
      to: txParams.to,
      from: txParams.from,
      value: txParams.value,
      data: txParams.data,
      gasLimit: txParams.gas || '0xffffffffffffffff',
      gasPrice: txParams.gasPrice,
    });

    //from is special unfortally and is not normilized by the setter
    transaction.from = new Buffer(normalizeHexString(txParams.from), 'hex');

    stateTrie.checkpoint();

    if (enableTrace) {
      var vmTrace = '';
      var stream = vm.logReadStream();

      stream.on('data', function(data){
        vmTrace += data;
      })
    }

    vm.runTx({
      tx: transaction,
      block: self.blockchain.head,
      skipNonce: true,
    }, function(err, results) {

      // cleanup
      stateTrie.revert();
      if (enableTrace) {
        stream.end();
      }

      // abort on error
      if (err) return cb(err);

      // process results
      if (results.vm.returnValue) {
        var returnValue = hexStrPrefix + results.vm.returnValue.toString('hex')
        if (enableTrace) {
          returnValue = {
            result: returnValue,
            vmTrace: vmTrace
          } 
        }
        cb(null, returnValue);
      } else {
        cb(null, null);
      }
    });
  });
}

//
// STUBS - these are not fully implemented
//

function accounts(params, cb) {
  cb(null, []);
}

function mining(params, cb) {
  cb(null, false);
}

function coinbase(params, cb) {
  var address = nullAddress;
  cb(null, hexStrPrefix + address.toString('hex'));
}

// util

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