// scripts/debug-eligibility-fixed.js
const { execSync } = require('child_process');

async function debugEligibility() {
  const userWallet = '0x4f6e9fe719e671671084e50f9c96f736e7ec2031';
  
  console.log('=== DEBUGGING ELIGIBILITY ===\n');
  
  // Check database directly
  try {
    // 1. Check user verifications
    console.log('1. Checking user verifications:');
    const verifications = execSync(`psql -h localhost -p 5433 -U postgres -d badgedb -c "SELECT provider, status, did FROM verifications WHERE wallet = '${userWallet}'" -t`, { encoding: 'utf8' });
    console.log(verifications || 'No verifications found');
    
    // 2. Check badge types and their rules - FIXED COLUMN NAME
    console.log('\n2. Checking badge types and rules:');
    const badgeTypes = execSync(`psql -h localhost -p 5433 -U postgres -d badgedb -c "SELECT key, name, rules FROM badge_types WHERE \\"isActive\\" = true" -t`, { encoding: 'utf8' });
    console.log(badgeTypes || 'No badge types found');
    
    // 3. Check if user already has any badges
    console.log('\n3. Checking existing mints:');
    const existingMints = execSync(`psql -h localhost -p 5433 -U postgres -d badgedb -c "SELECT badge_type_id FROM badge_mints WHERE wallet = '${userWallet}'" -t`, { encoding: 'utf8' });
    console.log(existingMints || 'No existing mints found');
    
  } catch (error) {
    console.error('Error running debug:', error.message);
  }
}

debugEligibility();