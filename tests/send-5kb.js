// Supporting script for the 5 KB frame test; expected WebSocket close code 1009.
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('open', () => {
  const payload = JSON.stringify({type:'message',room:'general',text:'A'.repeat(5100)});
  console.log(`Sending ${Buffer.byteLength(payload)} byte WebSocket payload`);
  ws.send(payload);
});
ws.on('message', data => console.log('Response:',String(data)));
ws.on('close', (code, reason) => console.log('Socket closed, code:',code,'reason:',String(reason)));
ws.on('error', err => console.log('Socket error:',err.message));
