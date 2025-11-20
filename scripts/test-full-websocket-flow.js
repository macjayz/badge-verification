const WebSocket = require('ws');
const axios = require('axios');

const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SERVER_URL = 'ws://localhost:3001/ws';
const API_BASE = 'http://localhost:3001/api';

// You'll need to set this token
const AUTH_TOKEN = process.env.TOKEN || 'your-jwt-token-here';

console.log('🧪 Testing Full WebSocket Event Flow...\n');
console.log('Wallet:', TEST_WALLET);
console.log('---\n');

async function testFullFlow() {
  // First, connect WebSocket
  const ws = new WebSocket(`${SERVER_URL}?wallet=${TEST_WALLET}`);
  
  let messageCount = 0;
  let mintIdToRevoke = null;
  let badgeTypeToTest = null;

  ws.on('open', async function open() {
    console.log('✅ Connected to WebSocket server');
    
    // Subscribe to channels
    const subscribeMsg = {
      type: 'subscribe',
      payload: {
        channels: ['wallet_events', 'minting', 'transactions', 'system']
      }
    };
    
    ws.send(JSON.stringify(subscribeMsg));
    console.log('📨 Subscribed to all channels');

    // Wait a bit for subscription to complete
    setTimeout(async () => {
      try {
        console.log('\n🔍 Step 1: Getting user mints to find one to revoke...');
        
        // Get user's current mints
        const mintsResponse = await axios.get(`${API_BASE}/minting/user/mints`, {
          headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        });

        const mints = mintsResponse.data;
        console.log(`📊 Found ${mints.length} existing mints`);
        
        // Find a mint that we can revoke (non-revoked)
        const mintToRevoke = mints.find(mint => !mint.isRevoked);
        
        if (mintToRevoke) {
          mintIdToRevoke = mintToRevoke.id;
          badgeTypeToTest = mintToRevoke.badgeType.key;
          
          console.log(`🔄 Step 2: Revoking mint ${mintIdToRevoke} (${badgeTypeToTest})...`);
          
          // Revoke the badge
          const revokeResponse = await axios.post(`${API_BASE}/minting/revoke`, {
            mintId: mintIdToRevoke,
            reason: 'Test revocation for WebSocket events'
          }, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
          });
          
          console.log('✅ Revocation initiated:', revokeResponse.data);
          
          // Wait for revocation to complete and WebSocket events
          setTimeout(async () => {
            console.log(`\n🎯 Step 3: Checking eligibility for ${badgeTypeToTest}...`);
            
            // Check eligibility first
            const eligibilityResponse = await axios.post(`${API_BASE}/minting/check-eligibility`, {
              badgeTypeKey: badgeTypeToTest
            }, {
              headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
            });
            
            console.log('✅ Eligibility check:', eligibilityResponse.data);
            
            if (eligibilityResponse.data.eligible) {
              console.log(`\n🎯 Step 4: Re-minting badge ${badgeTypeToTest}...`);
              
              // Now mint the same badge again
              const mintResponse = await axios.post(`${API_BASE}/minting/initiate`, {
                badgeTypeKey: badgeTypeToTest
              }, {
                headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
              });
              
              console.log('✅ Minting initiated:', mintResponse.data);
            } else {
              console.log('❌ Not eligible to mint:', eligibilityResponse.data.missingRequirements);
            }
            
          }, 3000);
          
        } else {
          console.log('❌ No non-revoked mints found to test with');
          
          // Try to check eligibility for any badge
          console.log('\n🔍 Checking available badges...');
          try {
            const eligibilityResponse = await axios.post(`${API_BASE}/minting/check-eligibility`, {
              badgeTypeKey: 'dao-voter'
            }, {
              headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
            });
            
            console.log('DAO Voter eligibility:', eligibilityResponse.data);
            
            if (eligibilityResponse.data.eligible) {
              console.log('\n🎯 Minting dao-voter badge...');
              const mintResponse = await axios.post(`${API_BASE}/minting/initiate`, {
                badgeTypeKey: 'dao-voter'
              }, {
                headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
              });
              console.log('✅ Minting initiated:', mintResponse.data);
            }
          } catch (error) {
            console.log('❌ Cannot mint dao-voter:', error.response?.data || error.message);
          }
        }
        
      } catch (error) {
        console.error('❌ API call failed:', error.response?.data || error.message);
      }
    }, 2000);
  });

  ws.on('message', function incoming(data) {
    messageCount++;
    const message = JSON.parse(data);
    
    console.log(`\n📥 [${messageCount}] ${message.type.toUpperCase()}`);
    
    // Show relevant details based on event type
    switch (message.type) {
      case 'subscription_confirmed':
        console.log('   ✅ Channels:', message.payload.subscribed?.join(', '));
        break;
        
      case 'badge_revoked':
        console.log('   🔴 Revocation:', message.payload.reason);
        console.log('   Mint ID:', message.payload.mintId);
        break;
        
      case 'minting_started':
        console.log('   🟡 Minting started for:', message.payload.badgeTypeKey);
        console.log('   Mint ID:', message.payload.mintId);
        break;
        
      case 'blockchain_transaction_starting':
        console.log('   ⚡ Transaction starting...');
        console.log('   Mint ID:', message.payload.mintId);
        break;
        
      case 'blockchain_transaction_submitted':
        console.log('   📝 Transaction submitted');
        console.log('   TX Hash:', message.payload.transactionHash);
        break;
        
      case 'minting_completed':
        console.log('   ✅ Minting completed!');
        console.log('   Token ID:', message.payload.tokenId);
        console.log('   TX Hash:', message.payload.transactionHash);
        break;
        
      case 'minting_success':
        console.log('   🎉 Minting success broadcast');
        console.log('   Badge:', message.payload.badgeTypeKey);
        break;
        
      case 'minting_failed':
        console.log('   ❌ Minting failed:', message.payload.error);
        break;

      case 'eligibility_check_started':
        console.log('   🔍 Eligibility check started');
        console.log('   Badge:', message.payload.badgeTypeKey);
        break;

      case 'eligibility_check_completed':
        console.log('   📋 Eligibility check completed');
        console.log('   Eligible:', message.payload.eligible);
        console.log('   Missing:', message.payload.missingRequirements);
        break;
        
      case 'system_health':
        // Skip system health to reduce noise, but show first one
        if (messageCount <= 5) {
          console.log('   🖥️  System health - Clients:', message.payload.clients);
        }
        break;
        
      default:
        console.log('   Type:', message.type);
        if (message.payload) {
          if (message.payload.wallet) console.log('   Wallet:', message.payload.wallet);
          if (message.payload.badgeTypeKey) console.log('   Badge:', message.payload.badgeTypeKey);
        }
    }
  });

  ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
  });

  ws.on('close', function close() {
    console.log('\n🔌 WebSocket connection closed');
    console.log(`📊 Total messages received: ${messageCount}`);
  });

  // Auto-close after 30 seconds
  setTimeout(() => {
    console.log('\n⏰ Test completed');
    ws.close();
    process.exit(0);
  }, 30000);
}

// Check if token is provided
if (!AUTH_TOKEN || AUTH_TOKEN === 'your-jwt-token-here') {
  console.error('❌ Please set the TOKEN environment variable:');
  console.error('   export TOKEN=your-jwt-token-here');
  console.error('   OR: node scripts/test-full-websocket-flow.js (with token hardcoded)');
  process.exit(1);
}

testFullFlow();