var jayson = require('jayson');
var App = require('../');
var settings = require('./settings.json');

var client = jayson.client.tcp({
  port: settings.rpc.port,
  hostname: 'localhost'
});

var app = new App(settings);
var address = "661005d2720d855f1d9976f88bb10c1a3398c77f";

app.start(function () {
  client.request('getStateAt', ['0x661005d2720d855f1d9976f88bb10c1a3398c77f', '0'], function (err, error, res) {
    console.log(res);

    app.stop();

  });
});
