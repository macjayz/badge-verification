// scripts/test-twitter-direct.js
require('dotenv').config();

async function testTwitterDirect() {
  console.log('🧪 DIRECT TWITTER API TEST\n');
  
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  
  console.log('Testing credentials:', clientId, clientSecret ? '***' : 'MISSING');
  
  // Test if we can make a simple request to Twitter API
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials'
      })
    });
    
    console.log('Direct test status:', response.status);
    console.log('Direct test response:', await response.text());
    
  } catch (error) {
    console.error('Direct test failed:', error.message);
  }
}

testTwitterDirect();