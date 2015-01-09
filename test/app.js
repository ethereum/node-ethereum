var App = require('../'),
  fs = require('fs'),
  async = require('async');

var app,
  peers = [],
  numberOfPeers = 5, //the amount of peers to create in this test must be more than 3 for the tests to work properly
  startPort = 30316;

describe('basic app functions', function() {

  it('should start', function(done) {
    app = new App();
    app.start(done);
  });

  it('should stop', function(done) {
    app.stop(done);
  });

  it('should start serveral instances', function(done) {
    var count = 0;

    async.whilst(

      function() {
        return count < numberOfPeers;
      },

      function(callback) {
        var settings = {
          'network': {
            'port': startPort,
            'host': '0.0.0.0'
          },
          'upnp': false,
          'rpc': false
        };

        count++;
        settings.network.port += count;
        settings.path = './test/testClient' + count;

        try {
          fs.mkdirSync(settings.path);
        } catch (e) {}

        app = new App(settings);
        peers.push(app);
        app.start(callback);

      },

      function() {
        done();
      }
    );
  });

  it('two peers should connect to each other', function(done) {
    async.parallel([
      function(cb2) {
        peers[1].network.once('hello', function() {
          cb2();
        });
      },
      function(cb2) {
        peers[0].network.once('hello', function() {
          cb2();
        });
      }
    ], done);

    peers[0].network.connect(startPort + 2, '0.0.0.0');
  });

  it('if a third peer joins then first two peers should both connect to it', function(done) {
    async.parallel([
      function(cb2) {
        peers[2].network.once('hello', function() {
          cb2();
        });
      },
      function(cb2) {
        peers[1].network.once('hello', function() {
          cb2();
        });
      },
      function(cb2) {
        peers[0].network.once('hello', function() {
          cb2();
        });
      }
    ], done);

    peers[2].network.connect(startPort + 1, '0.0.0.0');
  });

  it.skip('should send only peers that the peer does\'t know about on getPeers', function(done) {

    // peers[3].max =1

    // peers[3].network.on('getPeers', function(peers){
    //   peers === 4
    // });

    // peers[3].network.connect(startPort + 1, '0.0.0.0');
    done();

  });
});
