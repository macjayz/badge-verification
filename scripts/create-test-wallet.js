const { ethers } = require("hardhat");

async function main() {
  // Hardhat automatically creates test accounts
  const [deployer] = await ethers.getSigners();
  
  console.log('🎉 Using Hardhat test wallet:');
  console.log('══════════════════════════════════════');
  console.log('📍 Address:    ', deployer.address);
  console.log('🔐 Private Key:', deployer.privateKey);
  console.log('══════════════════════════════════════');
  console.log('💡 Add this to your .env file:');
  console.log(`DEPLOYER_PRIVATE_KEY=${deployer.privateKey}`);
  console.log('══════════════════════════════════════');
  console.log('💧 Get test ETH at: https://sepoliafaucet.com/');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});