import { run } from "hardhat";

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.log("❌ CONTRACT_ADDRESS not set in environment variables");
    return;
  }

  console.log(`🔍 Verifying contract at ${contractAddress}...`);

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: ["DeFi Camp Badges", "DFCBADGE"],
    });
    console.log("✅ Contract verified successfully!");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes("already verified")) {
        console.log("✅ Contract already verified");
      } else {
        console.log("❌ Verification failed:", error.message);
      }
    }
  }
}

main();