import { ethers } from "hardhat";
import { BADGE_NAME, BADGE_SYMBOL } from "./collection";

// Starter badge types. Their ids must match contractBadgeTypeId on the badge types in the database.
const BADGE_TYPES = [
  { id: 1, name: "Verified Creator", description: "Identity-verified content creator", maxSupply: 10_000 },
  { id: 2, name: "Early Supporter", description: "Early supporter with historical on-chain activity", maxSupply: 5_000 },
  { id: 3, name: "DAO Voter", description: "Active participant in DAO governance", maxSupply: 3_000 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying BadgeSBT from ${deployer.address}`);

  const badgeSBT = await (await ethers.getContractFactory("BadgeSBT")).deploy(BADGE_NAME, BADGE_SYMBOL);
  await badgeSBT.waitForDeployment();
  const address = await badgeSBT.getAddress();
  console.log(`BadgeSBT deployed at ${address} (tx ${badgeSBT.deploymentTransaction()?.hash})`);

  const metadataBase = process.env.BADGE_METADATA_BASE_URL;
  for (const type of BADGE_TYPES) {
    const uri = metadataBase ? `${metadataBase.replace(/\/$/, "")}/${type.id}.json` : "";
    await (await badgeSBT.createBadgeType(type.id, type.name, type.description, uri, type.maxSupply)).wait();
    console.log(`Created badge type ${type.id}: ${type.name}`);
  }

  console.log(`\nSet CONTRACT_ADDRESS=${address} in the backend environment.`);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
