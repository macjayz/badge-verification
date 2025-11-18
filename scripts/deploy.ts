import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying BadgeSBT contract...");

  // Get the deployer
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contract with account: ${deployer.address}`);

  // Deploy the contract
  const BadgeSBT = await ethers.getContractFactory("BadgeSBT");
  const badgeSBT = await BadgeSBT.deploy("DeFi Camp Badges", "DFCBADGE");
  
  await badgeSBT.waitForDeployment();
  const contractAddress = await badgeSBT.getAddress();

  console.log(`✅ BadgeSBT deployed to: ${contractAddress}`);
  console.log(`📝 Transaction hash: ${badgeSBT.deploymentTransaction()?.hash}`);

  // Create initial badge types
  console.log("🏷️ Creating initial badge types...");
  
  // Verified Creator Badge
  const tx1 = await badgeSBT.createBadgeType(
    1, // badgeTypeId
    "Verified Creator", 
    "Identity-verified content creator with proven credentials",
    "https://badges.defi.camp/metadata/verified-creator.json",
    10000 // max supply
  );
  await tx1.wait();
  console.log("✅ Created Verified Creator badge type");

  // Early Supporter Badge
  const tx2 = await badgeSBT.createBadgeType(
    2, // badgeTypeId
    "Early Supporter", 
    "Early supporter of DeFi Camp with historical activity",
    "https://badges.defi.camp/metadata/early-supporter.json",
    5000 // max supply
  );
  await tx2.wait();
  console.log("✅ Created Early Supporter badge type");

  // DAO Voter Badge
  const tx3 = await badgeSBT.createBadgeType(
    3, // badgeTypeId
    "DAO Voter", 
    "Active participant in governance and DAO voting",
    "https://badges.defi.camp/metadata/dao-voter.json",
    3000 // max supply
  );
  await tx3.wait();
  console.log("✅ Created DAO Voter badge type");

  console.log("🎉 Deployment completed successfully!");
  console.log(`🔗 Contract address: ${contractAddress}`);
  console.log(`👤 Deployer: ${deployer.address}`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});