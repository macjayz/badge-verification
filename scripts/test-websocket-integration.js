const WebSocket = require('ws');

// Test wallet address
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SERVER_URL = 'ws://localhost:3001/ws';

console.log('🧪 Testing WebSocket Events Integration...\n');
console.log('Wallet:', TEST_WALLET);
console.log('Server:', SERVER_URL);
console.log('---\n');

// Connect to WebSocket
const ws = new WebSocket(SERVER_URL);

let messageCount = 0;

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket server');
  
  // Subscribe to wallet-specific events
  const subscribeMsg = {
    type: 'subscribe',
    channel: 'wallet_events',
    walletAddress: TEST_WALLET
  };
  
  ws.send(JSON.stringify(subscribeMsg));
  console.log('📨 Subscribed to wallet events for:', TEST_WALLET);
  
  // Subscribe to minting channel
  const mintingSubscribe = {
    type: 'subscribe',
    channel: 'minting'
  };
  ws.send(JSON.stringify(mintingSubscribe));
  console.log('📨 Subscribed to minting channel');

  // Subscribe to transactions channel
  const transactionsSubscribe = {
    type: 'subscribe',
    channel: 'transactions'
  };
  ws.send(JSON.stringify(transactionsSubscribe));
  console.log('📨 Subscribed to transactions channel');

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
  console.log('   Channel:', message.channel || 'wallet');
  console.log('   Wallet:', message.data?.wallet || 'N/A');
  console.log('   Timestamp:', message.timestamp);
  
  if (message.data?.mintId) {
    console.log('   Mint ID:', message.data.mintId);
  }
  if (message.data?.transactionHash) {
    console.log('   TX Hash:', message.data.transactionHash);
  }
  if (message.data?.tokenId) {
    console.log('   Token ID:', message.data.tokenId);
  }
  if (message.data?.error) {
    console.log('   ❌ Error:', message.data.error);
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