var  ethen = require('ethen');

//kills the debugger in the process
process._debugEnd();

process.on('message', function(m) {
  if (m.command === 'start') {
    ethen.start(m.settings.port, m.settings.host);
  } else if(m.command === 'stop'){
    ethen.stop(function(){
      process.send('done');
    });
  }
});
