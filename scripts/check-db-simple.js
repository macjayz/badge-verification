const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

async function fixIssuerAlignment() {
  console.log('🛠️ Fixing issuer alignment...\n');
  
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'badgedb',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    
    // Get both issuers
    const issuersRes = await client.query('SELECT id, name FROM issuers ORDER BY "createdAt"');
    const issuer1 = issuersRes.rows[0]; // Test Issuer (has badges)
    const issuer2 = issuersRes.rows[1]; // Dashboard Test Issuer (has social rules)
    
    console.log(`Issuer 1: ${issuer1.id} - ${issuer1.name} (has badges)`);
    console.log(`Issuer 2: ${issuer2.id} - ${issuer2.name} (has social rules)`);
    
    // Option 1: Move social rules to issuer 1 (simpler)
    console.log('\n🔄 Moving social rules to Issuer 1...');
    await client.query('UPDATE project_social_rules SET "issuerId" = $1 WHERE "issuerId" = $2', 
      [issuer1.id, issuer2.id]);
    
    // Create additional social rules for issuer 1 if needed
    console.log('📝 Creating additional social rules for Issuer 1...');
    
    // Discord rule
    const discordRuleId = uuidv4();
    await client.query(`
      INSERT INTO project_social_rules (id, "issuerId", "ruleType", name, description, parameters, "isRequired", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `, [
      discordRuleId,
      issuer1.id,
      'discord_member',
      'Join Discord Server',
      'Join the Test Issuer Discord server',
      JSON.stringify({serverId: 'test_discord_123', serverName: 'Test Issuer Discord'}),
      true
    ]);
    
    // Snapshot rule
    const snapshotRuleId = uuidv4();
    await client.query(`
      INSERT INTO project_social_rules (id, "issuerId", "ruleType", name, description, parameters, "isRequired", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `, [
      snapshotRuleId,
      issuer1.id,
      'snapshot_votes',
      'Snapshot Voting',
      'Vote on Test Issuer proposals',
      JSON.stringify({spaceId: 'testissuer.eth', minVotes: 2}),
      true
    ]);
    
    // Create a test issuer-specific verification
    console.log('✅ Creating test issuer-specific verification...');
    const testWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'; // Hardhat wallet
    
    // Check if this wallet has a Twitter verification
    const twitterVerification = await client.query(
      'SELECT id FROM verifications WHERE wallet = $1 AND provider = $2 LIMIT 1',
      [testWallet, 'twitter_follow']
    );
    
    if (twitterVerification.rows.length > 0) {
      // Update existing verification to include issuer context
      const verificationId = twitterVerification.rows[0].id;
      const currentMetadata = await client.query(
        'SELECT metadata FROM verifications WHERE id = $1',
        [verificationId]
      );
      
      let metadata = {};
      if (currentMetadata.rows[0].metadata) {
        metadata = typeof currentMetadata.rows[0].metadata === 'string' 
          ? JSON.parse(currentMetadata.rows[0].metadata)
          : currentMetadata.rows[0].metadata;
      }
      
      metadata.issuerId = issuer1.id;
      
      await client.query(
        'UPDATE verifications SET metadata = $1 WHERE id = $2',
        [JSON.stringify(metadata), verificationId]
      );
      console.log('✅ Updated existing Twitter verification with issuer context');
    } else {
      // Create new issuer-specific verification
      const verificationId = uuidv4();
      await client.query(`
        INSERT INTO verifications (id, wallet, provider, type, status, did, metadata, "verificationId", "completedAt", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
      `, [
        verificationId,
        testWallet,
        'twitter_follow',
        'secondary',
        'completed',
        'did:twitter:test_user_123',
        JSON.stringify({
          twitterUsername: 'testuser',
          twitterId: '123456',
          issuerId: issuer1.id,
          followChecks: { 'testissuer': { success: true, follows: true } },
          verifiedAt: new Date().toISOString()
        }),
        'twitter_test_issuer_1'
      ]);
      console.log('✅ Created new issuer-specific Twitter verification');
    }
    
    // Verify the fix
    console.log('\n📊 ====== VERIFICATION ======');
    
    // Check badges for issuer 1
    const badgesRes = await client.query('SELECT COUNT(*) as count FROM badge_types WHERE "issuerId" = $1', [issuer1.id]);
    console.log(`Badges for ${issuer1.name}: ${badgesRes.rows[0].count}`);
    
    // Check social rules for issuer 1
    const rulesRes = await client.query('SELECT COUNT(*) as count FROM project_social_rules WHERE "issuerId" = $1', [issuer1.id]);
    console.log(`Social rules for ${issuer1.name}: ${rulesRes.rows[0].count}`);
    
    // Check issuer-specific verifications
    const issuerVerifications = await client.query(`
      SELECT COUNT(*) as count FROM verifications 
      WHERE metadata::jsonb ? 'issuerId'
    `);
    console.log(`Total issuer-specific verifications: ${issuerVerifications.rows[0].count}`);
    
    console.log('\n🎯 ====== FRONTEND TEST INFO ======');
    console.log(`Use this issuer ID in the frontend: ${issuer1.id}`);
    console.log(`Issuer Name: ${issuer1.name}`);
    console.log(`Available badges for this issuer: 3 (early_supporter, verified_creator, dao_voter)`);
    console.log(`Social rules: Twitter follow, Discord membership, Snapshot voting`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

// Check if uuid is available, otherwise generate a simple one
if (!require('uuid')) {
  global.uuidv4 = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

fixIssuerAlignment();