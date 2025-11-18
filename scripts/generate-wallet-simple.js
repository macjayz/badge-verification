const { ethers } = require('ethers');

console.log('🎉 Generating new test wallet for development...');
console.log('══════════════════════════════════════');

// Generate a new random wallet
const wallet = ethers.Wallet.createRandom();

console.log('📍 Address:');
console.log('   ' + wallet.address);
console.log('');

console.log('🔐 Private Key:');
console.log('   ' + wallet.privateKey);
console.log('');

console.log('📋 Mnemonic (12 words):');
console.log('   ' + wallet.mnemonic.phrase);
console.log('');

console.log('══════════════════════════════════════');
console.log('🚨 SECURITY WARNING:');
console.log('   • This is for TESTING only!');
console.log('   • NEVER use for real funds!');
console.log('   • Keep private key secure!');
console.log('');

console.log('💡 NEXT STEPS:');
console.log('   1. Copy the private key to your .env file:');
console.log('      DEPLOYER_PRIVATE_KEY=' + wallet.privateKey);
console.log('');
console.log('   2. Get test ETH from: https://sepoliafaucet.com/');
console.log('      Send to: ' + wallet.address);
console.log('');
console.log('   3. Deploy your contract!');
console.log('══════════════════════════════════════');