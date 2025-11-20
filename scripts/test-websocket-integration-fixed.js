const WebSocket = require('ws');

// Test wallet address
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SERVER_URL = 'ws://localhost:3001/ws';

console.log('🧪 Testing WebSocket Events Integration (Fixed)...\n');
console.log('Wallet:', TEST_WALLET);
console.log('Server:', SERVER_URL);
console.log('---\n');

// Connect to WebSocket with wallet in query string for authentication
const ws = new WebSocket(`${SERVER_URL}?wallet=${TEST_WALLET}`);

let messageCount = 0;

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket server');
  
  // ✅ CORRECT FORMAT: Subscribe to multiple channels at once
  const subscribeMsg = {
    type: 'subscribe',
    payload: {
      channels: ['wallet_events', 'minting', 'transactions', 'system']
    }
  };
  
  ws.send(JSON.stringify(subscribeMsg));
  console.log('📨 Subscribed to channels:', subscribeMsg.payload.channels.join(', '));
  
  // Send a ping to test
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'ping',
      payload: { test: 'connection' },
      timestamp: new Date().toISOString()
    }));
  }, 1000);

  console.log('\n🎯 Waiting for WebSocket events...');
  console.log('   Make API calls to test real events:\n');
  console.log('   - POST /api/minting/initiate');
  console.log('   - POST /api/minting/revoke');
  console.log('   - Demo events should appear automatically\n');
});

ws.on('message', function incoming(data) {
  messageCount++;
  const message = JSON.parse(data);
  
  console.log(`📥 [${messageCount}] Received WebSocket event:`);
  console.log('   Event Type:', message.type);
  console.log('   Channel:', message.channel || 'direct');
  
  if (message.type === 'subscription_confirmed') {
    console.log('   ✅ Subscribed to:', message.payload.subscribed?.join(', '));
    console.log('   📊 All subscriptions:', message.payload.channels?.join(', '));
  }
  else if (message.type === 'error') {
    console.log('   ❌ Error:', message.payload?.error);
  }
  else if (message.payload) {
    console.log('   Wallet:', message.payload.wallet || 'N/A');
    console.log('   Timestamp:', message.timestamp);
    
    if (message.payload.mintId) {
      console.log('   Mint ID:', message.payload.mintId);
    }
    if (message.payload.transactionHash) {
      console.log('   TX Hash:', message.payload.transactionHash);
    }
    if (message.payload.tokenId) {
      console.log('   Token ID:', message.payload.tokenId);
    }
    if (message.payload.status) {
      console.log('   Status:', message.payload.status);
    }
  }
  
  console.log('---');
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('\n🔌 WebSocket connection closed');
  console.log(`📊 Total messages received: ${messageCount}`);
});

// Keep the connection open for testing
setTimeout(() => {
  console.log('\n⏰ Test completed after 60 seconds');
  console.log(`📊 Total messages received: ${messageCount}`);
  console.log('\n🎯 Next steps:');
  console.log('   1. Check server logs for WebSocket event emissions');
  console.log('   2. Verify events match between server and client');
  console.log('   3. Test with actual API calls to minting endpoints');
  ws.close();
  process.exit(0);
}, 60000);