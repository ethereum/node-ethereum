node-ethereum [![Build Status](https://travis-ci.org/ethereum/node-ethereum.svg)](https://travis-ci.org/ethereum/node-ethereum)
===============
[DEPICATED]   
this is being broken into micro-services
-see [node blockchain server](https://github.com/ethereum/node-blockchain-server)

a simple standalone or embeddable Ethereum client written for Node.js.

Install
===
`git clone https://github.com/ethereum/node-ethereum`
`cd ./node-ethereum`  
`npm install .`

Run
===
`./bin/neth`

Embed
===
```javacsript
 App = require('../')
 app = new App();
 app.start(function(){
  console.log("Ethereum has started");
 });
```
