const Express = require('express');
const bodyParser = require('body-parser');
const async = require('async');

module.exports = HttpRpc;


function HttpRpc(rpc){

  var server = this.server = Express();

  // parse application/json even if it doesnt say its json (*/* does not work)
  server.use(bodyParser.json({ type: 'application/*' }));
  server.use(bodyParser.json({ type: 'text/*' }));

  // allow any origin
  // explicitly listing the request origin instead on wildcard b/c of below issue
  // when resolved, could use ghub.io/cors instead
  // https://github.com/ethereum/ethereum.js/issues/36
  server.use(function(req, res, next) {
    if (req.headers.origin) {
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
    }
    next();
  });

  // helpful message for wrong http verb
  server.get('/', function (req, res) {
    res.send('XHR JSON RPC available via POST');
  });

  // extract message and call rpc
  server.post('/', function (req, res) {

    // handle request
    var message = req.body;
    if (message && Object.keys(message).length) {

      var isBatch = Array.isArray(message);

      if (isBatch) {
        
        var messages = message
        async.mapSeries(messages, function(message, cb){
          rpc.processRpc(message, function(err, data){
            if (err) {
              cb(null, jsonErrorObject(err));
            } else {
              cb(null, data);
            }
          });
        }, respondToRequest);

      } else {

        rpc.processRpc(message, respondToRequest);

      }

    } else {

      respondToRequest(new Error('Could not parse RPC body.'));

    }

    function respondToRequest(err, data) {
      if (err) {
        res.status(500).send(jsonErrorObject(err));
      } else {
        res.send(data);
      }
    }

    function jsonErrorObject(err) {
      return {
        error: {
          code: err.code || -32603,
          message: err.message || err,
          stack: err.stack,
        }
      };
    }

  });

}

//the function that starts the application
HttpRpc.prototype.start = function(options, done) {
  var port = options.port || 8080;
  console.log('HttpRpcServer - opening: /:' + port);
  this.httpServer = this.server.listen(port);
  process.once('SIGTERM', this.stop.bind(this));
  process.once('SIGINT', this.stop.bind(this));

  done();
};

HttpRpc.prototype.stop = function(done) {
  this.httpServer.close();
  if (done) done();
};
