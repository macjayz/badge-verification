// scripts/test-snapshot-real-vs-mock.js
const { AppDataSource } = require('../src/db/datasource');
const { EligibilityService } = require('../src/services/eligibility.service');
const { SnapshotService } = require('../src/services/snapshot.service');

async function test() {
  console.log('=== Testing Snapshot Service Usage ===');
  
  // Initialize database if needed
  await AppDataSource.initialize();
  
  const eligibilityService = new EligibilityService();
  const snapshotService = new SnapshotService();
  
  const testWallet = '0x441c864e8e10e1450a1391374ac0109c84d85f32';
  const testRule = {
    method: 'snapshot_votes',
    required: true,
    params: { minVotes: 1 }
  };
  
  console.log('\n1. Testing with wallet that has NO votes:');
  console.log('   Wallet:', testWallet);
  
  // Test direct Snapshot service
  console.log('\n2. Direct Snapshot service check:');
  const snapshotResult = await snapshotService.checkVoteRequirements(testWallet, { minVotes: 1 });
  console.log('   Result:', snapshotResult);
  
  // Test eligibility check
  console.log('\n3. Eligibility service check:');
  try {
    // We need to call the private method - for testing only
    const verificationResult = await eligibilityService.verifySecondaryRule(testWallet, testRule);
    console.log('   Verification result:', verificationResult);
  } catch (error) {
    console.log('   Error:', error.message);
  }
  
  await AppDataSource.destroy();
}

test().catch(console.error);