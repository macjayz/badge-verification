// scripts/verify-twitter-credentials.js
require('dotenv').config();

console.log('🔐 VERIFYING TWITTER CREDENTIALS FORMAT\n');

const clientId = process.env.TWITTER_CLIENT_ID;
const clientSecret = process.env.TWITTER_CLIENT_SECRET;

console.log('Client ID Analysis:');
console.log('   Raw:', clientId);
console.log('   Length:', clientId?.length);
console.log('   Looks like API Key:', clientId?.startsWith('cjNf') ? 'Possibly' : 'No');
console.log('   Contains colon:', clientId?.includes(':') ? 'Yes' : 'No');

console.log('\nClient Secret Analysis:');
console.log('   Length:', clientSecret?.length);
console.log('   Format: Usually 50 characters for Twitter');

console.log('\n🔧 SUGGESTED ACTIONS:');
console.log('1. Go to https://developer.twitter.com/');
console.log('2. Navigate to your Project & App');
console.log('3. Click on "Keys and Tokens"');
console.log('4. Look for "OAuth 2.0 Client ID and Client Secret"');
console.log('5. Make sure you\'re using the OAuth 2.0 credentials, not API Key/Secret');

// Test if credentials work with Basic Auth
if (clientId && clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  console.log('\nBasic Auth Header would be:');
  console.log('   Authorization: Basic', credentials.substring(0, 20) + '...');
}