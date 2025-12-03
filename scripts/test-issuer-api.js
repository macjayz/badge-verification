const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TEST_WALLET = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

async function getValidToken() {
  console.log('🔑 Getting valid JWT token...\n');
  
  try {
    // Try to authenticate with SIWE
    console.log('1. Requesting SIWE message...');
    const messageRes = await axios.post(`${BASE_URL}/api/auth/siwe/message`, {
      address: TEST_WALLET,
      chainId: 1
    });
    
    console.log('Message received');
    
    // For testing, let's try the simple token generation endpoint if it exists
    console.log('\n2. Trying to get token...');
    const tokenRes = await axios.post(`${BASE_URL}/api/auth/token`, {
      wallet: TEST_WALLET
    });
    
    console.log('Token:', tokenRes.data.token);
    return tokenRes.data.token;
    
  } catch (error) {
    console.log('Error getting token:', error.response?.data || error.message);
    
    // Try alternative: Check if there's a test endpoint
    console.log('\n3. Trying test token endpoint...');
    try {
      const testRes = await axios.get(`${BASE_URL}/api/auth/test-token/${TEST_WALLET}`);
      console.log('Test token:', testRes.data.token);
      return testRes.data.token;
    } catch (e) {
      console.log('No test endpoint:', e.message);
    }
    
    return null;
  }
}

getValidToken();