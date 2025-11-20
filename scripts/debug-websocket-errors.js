const WebSocket = require('ws');

const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SERVER_URL = 'ws://localhost:3001/ws';

console.log('🔍 Debugging WebSocket Errors...\n');
console.log('Wallet:', TEST_WALLET);
console.log('Server:', SERVER_URL);
console.log('---\n');

const ws = new WebSocket(SERVER_URL);

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket server');
  
  // Test different subscription formats
  const subscriptions = [
    {
      type: 'subscribe',
      channel: 'wallet_events',
      walletAddress: TEST_WALLET
    },
    {
      action: 'subscribe',
      channel: 'minting'
    },
    {
      event: 'subscribe',
      topic: 'transactions'
    },
    // Simple string subscription
    JSON.stringify({
      type: 'subscribe',
      channel: 'wallet',
      wallet: TEST_WALLET
    })
  ];

  subscriptions.forEach((sub, index) => {
    setTimeout(() => {
      console.log(`\n📨 Attempting subscription ${index + 1}:`, JSON.stringify(sub));
      ws.send(typeof sub === 'string' ? sub : JSON.stringify(sub));
    }, index * 1000);
  });
});

ws.on('message', function incoming(data) {
  try {
    const message = JSON.parse(data);
    console.log('\n📥 Received:', JSON.stringify(message, null, 2));
    
    if (message.type === 'error' && message.data) {
      console.log('❌ ERROR DETAILS:', message.data);
    }
  } catch (e) {
    console.log('📥 Received (non-JSON):', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket connection error:', err.message);
});

ws.on('close', function close(code, reason) {
  console.log('\n🔌 WebSocket connection closed');
  console.log('Code:', code);
  console.log('Reason:', reason?.toString());
});

// Auto-close after 15 seconds
setTimeout(() => {
  console.log('\n⏰ Debug session ended');
  ws.close();
  process.exit(0);
}, 15000);