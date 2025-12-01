// scripts/test-twitter-real.js
require('dotenv').config(); // ADD THIS LINE
const axios = require('axios');

async function testTwitterReal() {
  console.log('🧪 TESTING REAL TWITTER OAUTH FLOW\n');
  
  const testWallet = '0x742E6c9eF87c6d1e1942a5FfD55a4831A6b07095';
  
  try {
    // Debug: Show what credentials we're using
    console.log('🔐 Credentials Check:');
    console.log('   TWITTER_CLIENT_ID:', process.env.TWITTER_CLIENT_ID ? '✓ Set' : '✗ Missing');
    console.log('   TWITTER_CLIENT_SECRET:', process.env.TWITTER_CLIENT_SECRET ? '✓ Set (' + process.env.TWITTER_CLIENT_SECRET.length + ' chars)' : '✗ Missing');
    console.log('   TWITTER_REDIRECT_URI:', process.env.TWITTER_REDIRECT_URI);
    console.log('');

    // Test 1: Check if server is running
    console.log('1. Checking server health...');
    const healthResponse = await axios.get('http://localhost:3001/health');
    console.log('✅ Server is running\n');

    // Test 2: Initiate Twitter OAuth
    console.log('2. Initiating Twitter OAuth...');
    const oauthResponse = await axios.post('http://localhost:3001/api/verify/twitter/oauth/initiate', {
      wallet: testWallet
    });
    
    console.log('✅ OAuth initiation successful');
    console.log('   Auth URL:', oauthResponse.data.data.authUrl);
    console.log('   State:', oauthResponse.data.data.state);
    console.log('   Code Verifier:', oauthResponse.data.data.codeVerifier);
    console.log('');

    // Test 3: Check Twitter connection status
    console.log('3. Checking Twitter connection status...');
    const statusResponse = await axios.get(`http://localhost:3001/api/verify/twitter/status/${testWallet}`);
    console.log('✅ Status check successful');
    console.log('   Connected:', statusResponse.data.data.connected);
    console.log('   Username:', statusResponse.data.data.username || 'Not connected');
    console.log('');

    console.log('🎯 NEXT STEPS:');
    console.log('1. Visit the Auth URL in your browser to test the OAuth flow');
    console.log('2. Complete Twitter authentication');
    console.log('3. Check callback handling');
    console.log('4. Verify connection status updates');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      console.log('\n🔧 Debugging tips:');
      console.log('   - Check Twitter credentials in .env');
      console.log('   - Verify Twitter App configuration');
      console.log('   - Ensure redirect URI matches exactly');
      console.log('   - Check server logs for detailed errors');
    }
  }
}

// Check if we have real Twitter credentials
if (!process.env.TWITTER_CLIENT_ID || process.env.TWITTER_CLIENT_ID === 'dev_client_id') {
  console.log('⚠️  Please uncomment TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in .env file');
  console.log('   Then restart your server and run this test again');
} else {
  testTwitterReal();
}