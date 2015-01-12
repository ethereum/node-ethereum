var crypto = require('crypto');

/**
 * @constructor
 */
var Account = module.exports = function (name, raw, db) {
  this.nonce = raw[0];
  this.pks = raw[1];
  this.addressLabels = raw[2];
  this.txLabels = raw[3];
  this.name = name;
  this.db = db;
};

Account.prototype.recreateKeys = function () {
  for (var i = 0; i < this.nonce; i++) {
    var key = crypto.pbkdf2Sync(this.pks[0], i, 1000, 16);
    this.pks.push(key);
  }
};

// Account.prototype.addAddressLabel = function(account, label, cb){

// };

// Account.prototype.addTxLabel = function(tx, label, cb){

// };

// Account.prototype.serialize = function(){

// };

// module.exports.start = function() {

// }

// module.exports.stop = function() {

// }
