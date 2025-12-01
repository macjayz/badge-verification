// scripts/debug-twitter-401.js
require('dotenv').config();
const axios = require('axios');

async function debugTwitter401() {
  console.log('🔍 DEBUGGING TWITTER 401 ERROR\n');
  
  console.log('1. Checking Credentials:');
  console.log('   Client ID:', process.env.TWITTER_CLIENT_ID);
  console.log('   Client Secret length:', process.env.TWITTER_CLIENT_SECRET?.length);
  console.log('   Redirect URI:', process.env.TWITTER_REDIRECT_URI);
  console.log('');
  
  console.log('2. Testing Twitter App Configuration:');
  
  // Test if credentials are valid by making a direct request
  const testAuthCode = 'test_code_123';
  const testCodeVerifier = 'test_verifier_123';
  
  const requestBody = new URLSearchParams({
    client_id: process.env.TWITTER_CLIENT_ID,
    client_secret: process.env.TWITTER_CLIENT_SECRET,
    code: testAuthCode,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TWITTER_REDIRECT_URI,
    code_verifier: testCodeVerifier,
  }).toString();
  
  console.log('   Request URL: https://api.twitter.com/2/oauth2/token');
  console.log('   Request Body (masked):', requestBody.replace(process.env.TWITTER_CLIENT_SECRET, '***MASKED***'));
  console.log('');
  
  try {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody,
    });
    
    console.log('   Response Status:', response.status);
    console.log('   Response Text:', await response.text());
    
  } catch (error) {
    console.log('   Request failed:', error.message);
  }
  
  console.log('\n3. Twitter App Checklist:');
  console.log('   ✅ Go to https://developer.twitter.com/');
  console.log('   ✅ Navigate to your App settings');
  console.log('   ✅ Check "App permissions": Should be "Read"');
  console.log('   ✅ Check "Type of App": Should be "Native App" or "Web App"');
  console.log('   ✅ Check "Callback URI": Must match exactly:', process.env.TWITTER_REDIRECT_URI);
  console.log('   ✅ Check "OAuth 2.0": Should be enabled');
  console.log('   ✅ Check if App is in "Development" mode (may need Elevated access)');
}

debugTwitter401();