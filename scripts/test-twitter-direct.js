require('dotenv').config();

async function testTwitterComplete() {
  console.log('🎯 COMPLETE TWITTER TEST\n');
  
  console.log('=== STEP 1: Login with demo wallet ===');
  const loginRes = await fetch('http://localhost:3001/api/user/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    })
  });
  
  if (!loginRes.ok) {
    console.log('❌ Login failed');
    return;
  }
  
  const { token } = await loginRes.json();
  console.log('✅ Logged in, token:', token.substring(0, 20) + '...');
  
  console.log('\n=== STEP 2: Initiate Twitter OAuth ===');
  const twitterRes = await fetch('http://localhost:3001/api/verify/twitter/oauth/initiate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    })
  });
  
  const twitterData = await twitterRes.json();
  console.log('✅ OAuth initiated');
  console.log('State:', twitterData.data.state);
  console.log('Auth URL (first 100 chars):', twitterData.data.authUrl.substring(0, 100) + '...');
  
  console.log('\n=== STEP 3: MANUAL TEST ===');
  console.log('1. Open this URL in your browser:');
  console.log(twitterData.data.authUrl);
  console.log('\n2. Login to Twitter (if not already)');
  console.log('3. Click "Authorize app"');
  console.log('4. You will be redirected to callback');
  console.log('5. The popup will close automatically');
  console.log('\n6. Check server logs for verification results');
  
  console.log('\n=== STEP 4: Verify Connection ===');
  console.log('After authorization, run:');
  console.log('curl http://localhost:3001/api/verify/twitter/status/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  
  console.log('\n🎯 Expected result:');
  console.log('- Twitter OAuth: ✅ Works');
  console.log('- User authentication: ✅ Works');
  console.log('- Follow verification: ❌ Will fail (Standalone App limitation)');
  console.log('- Connection status: ✅ Will show "connected"');
}

testTwitterComplete().catch(console.error);