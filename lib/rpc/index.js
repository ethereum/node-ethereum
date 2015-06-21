const Block = require('ethereumjs-lib').Block;
const netDefs = require('ethereumjs-lib').networkDef;
const ethUtil = require('ethereumjs-util');
const eth = require('./eth.js');
const net = require('./net.js');
const SUPPORTED_RPC_VERSION = '2.0';
const hexStrPrefix = '0x';

module.exports = EthRPC;


function EthRPC(app) {
  // required
  this.blockchain = app.blockchain;
  this.vm = app.vm;
  // optional
  this.network = app.network;

  this.trie = this.vm.trie;
  this.protocolVersion = netDefs.meta.version;

  this._setupHandlers();
  this._setupFilters();
}

EthRPC.prototype.processRpc = function(rpcMessage, cb) {
  // parse rpc arguments
  var method = rpcMessage.method;
  var params = rpcMessage.params;
  var requestId = rpcMessage.id;
  var version = rpcMessage.jsonrpc;
  // extract relevant function
  var fn = this._fnForMethod(method);
  // check rpc version
  if (version !== SUPPORTED_RPC_VERSION) {
    fn = versionNotSupported;
  }
  // execute rpc method
  fn.call(this, params, function(err, result) {
    if (err) return cb(err);
    cb(null, wrapResult(requestId, result));
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
  var responseObj = {
    id: requestId,
    jsonrpc: SUPPORTED_RPC_VERSION,
    result: value
  };
  // if trace is present, move trace onto response object
  // and use correct return variable
  if (value && value.vmTrace) {
    responseObj.result = value.result;
    responseObj.vmTrace = value.vmTrace;
  }
  return responseObj;
}

/**
 * Fetches a block given a blockHash or A block Number. The callback is then
 * given a Trie that is set to the stateRoot of the found block if there is one
 */
EthRPC.prototype.getStateAtBlock = function(blockHash, cb) {
  blockHash = normalizeHexString(blockHash)
  var self = this;

  if (blockHash === 'last') {
    blockhash = this.blockchain.meta.genesis;
  }

  if (blockHash === 'latest' || blockHash === 'pending') {
    cb(null, this.vm.trie);
  } else if (blockHash) {

    if (blockHash.length === 64) {
      //lookup a hash
      this.blockchain.getBlock(blockHash, blockToStateTrie);
    } else {
      //find block by number
      this.blockchain.getBlockByNumber(blockHash, blockToStateTrie);
    }
  } else {
    cb(null, this.vm.trie);
  }

  function blockToStateTrie(err, block) {
    if (err) return cb(err);

    var stateRoot = block.header.stateRoot;
    var trie = self.trie.copy();

    trie.root = stateRoot;
    cb(null, trie);
  }
};

EthRPC.prototype._setupHandlers = function() {
  this.rpcHandlers = {
    // --- eth ---
    eth_getBlockByHash: eth.getBlockByHash,
    eth_getBlockByNumber: eth.getBlockByNumber,
    eth_transactionByNumber: eth.transactionByNumber,
    eth_uncleByNumber: eth.uncleByNumber,
    eth_newFilter: eth.newFilter,
    eth_newBlockFilter: eth.newBlockFilter,
    eth_getFilterChanges: eth.getFilterChanges,
    eth_getFilterLogs: eth.getFilterLogs,
    eth_uninstallFilter: eth.uninstallFilter,
    eth_protocolVersion: eth.protocolVersion,
    eth_blockNumber: eth.blockNumber,
    eth_getBalance: eth.getBalance,
    eth_number: eth.number,
    eth_peerCount: eth.peerCount,
    eth_accounts: eth.accounts,
    eth_mining: eth.mining,
    eth_coinbase: eth.coinbase,
    // ( not implemented )
    eth_setCoinbase: notImplemented,
    eth_setMining: notImplemented,
    eth_gasPrice: notImplemented,
    eth_defaultBlock: notImplemented,
    eth_setDefaultBlock: notImplemented,
    eth_transact: notImplemented,
    eth_transactionByHash: notImplemented,
    eth_uncleByHash: notImplemented,
    eth_compilers: notImplemented,
    eth_lll: notImplemented,
    eth_solidity: notImplemented,
    eth_serpent: notImplemented,
    // --- net ---
    net_listening: eth.listening,
    // --- shh ---
    // ( not implemented )
    shh_post: notImplemented,
    shh_newIdeninty: notImplemented,
    shh_haveIdentity: notImplemented,
    shh_newGroup: notImplemented,
    shh_addToGroup: notImplemented,
    shh_newFilter: notImplemented,
    shh_uninstallFilter: notImplemented,
    shh_changed: notImplemented,
    // --- db ---
    // ( not implemented )
    db_put: notImplemented,
    db_get: notImplemented,
    db_putString: notImplemented,
    db_getString: notImplemented,
  }
};

EthRPC.prototype._setupFilters = function() {
  var self = this;

  // filter state
  this._logFilters = {};
  this._blockFilters = { pending: {}, latest: {} };
  
  // update "pending" block filters
  this.vm.on('afterTx', function(){
    for (id in self._blockFilters.pending) {
      var pendingFilter = self._blockFilters.pending[id]
      // "For filters created with eth_newBlockFilter log objects are null."
      // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_getfilterchanges
      pendingFilter.results.push(null)
    }
  })

  // update "latest" block filters
  this.vm.on('block', function(){
    for (id in self._blockFilters.latest) {
      var blockFilter = self._blockFilters.latest[id]
      // "For filters created with eth_newBlockFilter log objects are null."
      // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_getfilterchanges
      blockFilter.results.push(null)
    }
  })

  // update log filters
  this.vm.on('logs', function(logEvent) {
    for (var id in self._logFilters) {
      var filter = self._logFilters[id];
      // check for log filter match
      if (logEvent.bloom.multiCheck(filter.topics)) {
        onLogFilterBloomMatch(filter, logEvent, id)
      }
    }
  });

  function onLogFilterBloomMatch(filter, logEvent, id) {
    logEvent.logs.forEach(function(log, logIndex) {
      //push to the filter queue
      var match = true;
      var logTopics = log[1];
      // add address as topic
      logTopics.push(log[0]);

      filter.topics.forEach(function(filterTopic) {
        var filterMatch = false

        logTopics.forEach(function(logTopic) {
          filterMatch |= (logTopic.toString('hex') === filterTopic);
        });
        match &= filterMatch;
      });

      if (match) {
        var transactionIndex;
        if(logEvent.block){
          transactionIndex = logEvent.block.transactions.indexOf(logEvent.tx)
          //if -1
          if(transactionIndex < 0) transactionIndex = 0;
        }else{
          transactionIndex = 0;  
          logEvent.block = new Block();
        }

        filter.results.push({
          // HEX String - integer of the log index position in the block.
          logIndex: hexStrPrefix+ethUtil.intToHex(logIndex),
          // HEX String - integer of the transactions index position log was created from.
          transactionIndex: hexStrPrefix+ethUtil.intToHex(transactionIndex),
          // HEX String - hash of the transactions this log was created from.
          transactionHash: hexStrPrefix+logEvent.tx.hash().toString('hex'),
          // HEX String - 32-byte hash of the block where this log was in. null when the log is pending.
          blockHash: logEvent.block.hash().toString('hex'),
          // HEX String - integer of the block number where this log was in. null when the log is pending.
          blockNumber: hexStrPrefix+logEvent.block.header.number.toString('hex'),
          // HEX String - address from which this log originated.
          address: log[0].toString('hex'),
          // HEX String - contains the non-indexed arguments of the log.
          data: log[2].toString('hex'),
          // Array - Array of 0 to 4 HEX Strings of indexed log arguments.
          topics: logTopics.map(function(buffer) { return buffer.toString('hex') }),
        });
      }
    });
  }

}

//
// Method map
//
EthRPC.prototype._fnForMethod = function(method) {
  return this.rpcHandlers[method] || noSuchMethod;
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
