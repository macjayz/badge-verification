import { run } from "hardhat";
import { BADGE_NAME, BADGE_SYMBOL } from "./collection";

async function main() {
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) {
    throw new Error("Set CONTRACT_ADDRESS to the deployed BadgeSBT address");
  }

  try {
    await run("verify:verify", { address, constructorArguments: [BADGE_NAME, BADGE_SYMBOL] });
    console.log(`Verified ${address}`);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("already verified")) {
      console.log(`${address} is already verified`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
