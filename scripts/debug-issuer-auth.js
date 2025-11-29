require('reflect-metadata');
const { AppDataSource } = require('../src/db/datasource');
const { Issuer } = require('../src/entities/Issuer');

async function debugIssuerAuth() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected');
    
    const issuerRepo = AppDataSource.getRepository(Issuer);
    
    // Try exact match first
    console.log('\n🔍 Looking for exact API key match...');
    const issuer = await issuerRepo.findOne({
      where: { apiKey: 'test-api-key-12345' }
    });
    
    console.log('Exact match found:', !!issuer);
    
    if (issuer) {
      console.log('Issuer details:', {
        id: issuer.id,
        name: issuer.name,
        wallet: issuer.wallet,
        apiKey: issuer.apiKey,
        isActive: issuer.isActive
      });
    } else {
      // Check all issuers to see what's available
      console.log('\n📋 Checking all issuers in database...');
      const allIssuers = await issuerRepo.find();
      
      if (allIssuers.length === 0) {
        console.log('❌ No issuers found in database!');
      } else {
        console.log(`Found ${allIssuers.length} issuer(s):`);
        allIssuers.forEach((iss, index) => {
          console.log(`\n${index + 1}. ${iss.name}`);
          console.log(`   ID: ${iss.id}`);
          console.log(`   Wallet: ${iss.wallet}`);
          console.log(`   API Key: "${iss.apiKey}"`);
          console.log(`   Active: ${iss.isActive}`);
          console.log(`   Created: ${iss.createdAt}`);
        });
        
        // Try to find by partial match
        console.log('\n🔍 Checking for similar API keys...');
        const similarIssuers = allIssuers.filter(iss => 
          iss.apiKey.includes('test') || iss.apiKey.includes('key')
        );
        
        if (similarIssuers.length > 0) {
          console.log('Similar issuers found:');
          similarIssuers.forEach(iss => {
            console.log(`- "${iss.apiKey}" (${iss.name})`);
          });
        }
      }
    }
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugIssuerAuth();