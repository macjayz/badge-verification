require('dotenv').config();

async function testBearerToken() {
  console.log('🧪 Testing Twitter Bearer Token\n');
  
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  
  if (!bearerToken) {
    console.log('❌ TWITTER_BEARER_TOKEN not found in .env');
    return;
  }
  
  console.log('✅ Bearer Token found');
  console.log(`Token length: ${bearerToken.length} characters`);
  console.log(`Token starts with: ${bearerToken.substring(0, 20)}...`);
  
  // Test the token with a simple API call
  console.log('\n🔍 Testing Bearer Token with Twitter API...');
  
  try {
    // Test with a public endpoint
    const testUserId = '783214'; // @X user ID
    
    const response = await fetch(
      `https://api.twitter.com/1.1/friendships/show.json?source_id=${testUserId}&target_id=44196397`, // @X to @elonmusk
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );
    
    console.log(`API Response Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Bearer Token works!');
      console.log('API Response:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Bearer Token rejected');
      console.log('Error:', errorText);
      
      if (response.status === 403) {
        console.log('\n⚠️  IMPORTANT: Standalone App limitation detected');
        console.log('Your app may not have access to friendships API');
        console.log('Consider creating a Project App for full access');
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
  
  console.log('\n🎯 Next steps:');
  console.log('1. Restart your server with: npm run dev');
  console.log('2. Test Twitter verification flow');
  console.log('3. Check server logs for Bearer Token usage');
}

testBearerToken();