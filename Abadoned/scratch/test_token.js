
const { AccessToken } = require('livekit-server-sdk');

const apiKey = 'APIHdMJPHYy8rMN';
const apiSecret = 'LUKM5lMgk1CDEviRbEGC5KNNDeICYwSzJ0PEpUsTQZD';
const room = 'elite-main-room';
const identity = 'test-script';

const at = new AccessToken(apiKey, apiSecret, {
  identity,
});

at.addGrant({
  room,
  roomJoin: true,
});

async function run() {
  const token = await at.toJwt();
  console.log('Token generated successfully.');
  console.log('Token:', token);
}

run();

// Note: Testing actual connection from Node is harder without a full client.
// But we can verify if the token is valid.
