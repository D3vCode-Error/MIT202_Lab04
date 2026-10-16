// Supporting measurement script for Table 1.1; run AFTER the server is started.
const WebSocket = require('ws');
const { performance } = require('node:perf_hooks');
const sender = new WebSocket('ws://localhost:3000/ws');
const receiver = new WebSocket('ws://localhost:3000/ws');
let ready = 0, current = 0, started = 0;
const results = [];
function sendNext() {
  if (current === 20) {
    console.log('20 measured one-way application delivery samples (ms):');
    results.forEach((ms, i) => console.log(`${i+1}: ${ms.toFixed(3)}`));
    console.log(`Average: ${(results.reduce((a,b)=>a+b,0)/results.length).toFixed(3)} ms`);
    sender.close(); receiver.close(); return;
  }
  current++;
  started = performance.now();
  sender.send(JSON.stringify({type:'message',room:'general',text:`sample-${current}`}));
}
receiver.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'joined') { if (++ready === 2) sendNext(); return; }
  if (msg.type === 'message' && msg.text === `sample-${current}`) {
    results.push(performance.now() - started);
    sendNext();
  }
});
sender.on('message', (raw) => { if(JSON.parse(raw).type === 'joined' && ++ready === 2) sendNext(); });
for (const ws of [sender,receiver]) {
  ws.on('open',()=>ws.send(JSON.stringify({type:'join',room:'general'})));
  ws.on('error',err=>{console.error(err.message);process.exitCode=1;});
}
