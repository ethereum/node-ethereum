
module.exports = {
  listening: listening,
}


function listening(params, cb) {
  if (this.network) {
    cb(null, this.network.listening);
  } else {
    cb(null, false);
  }
}