import { expect } from "chai";
import { ethers } from "hardhat";

describe("BadgeSBT", () => {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const badges = await (await ethers.getContractFactory("BadgeSBT")).deploy("Verified Badges", "VBADGE");
    await badges.createBadgeType(1, "DAO Voter", "Votes in governance", "", 2);
    return { badges, owner, alice, bob };
  }

  it("mints a badge and reports it held", async () => {
    const { badges, alice } = await deploy();
    await expect(badges.mintBadge(alice.address, 1)).to.emit(badges, "BadgeMinted");
    expect(await badges.ownerOf(1)).to.equal(alice.address);
    expect(await badges.hasBadge(alice.address, 1)).to.equal(true);
  });

  it("cannot be transferred", async () => {
    const { badges, alice, bob } = await deploy();
    await badges.mintBadge(alice.address, 1);
    await expect(
      badges.connect(alice).transferFrom(alice.address, bob.address, 1),
    ).to.be.revertedWith("SBT: non-transferable");
  });

  it("mints each badge type to a wallet only once", async () => {
    const { badges, alice } = await deploy();
    await badges.mintBadge(alice.address, 1);
    await expect(badges.mintBadge(alice.address, 1)).to.be.revertedWith("Wallet already has this badge");
  });

  it("stops at the badge type's max supply", async () => {
    const { badges, owner, alice, bob } = await deploy();
    await badges.mintBadge(alice.address, 1);
    await badges.mintBadge(bob.address, 1);
    await expect(badges.mintBadge(owner.address, 1)).to.be.revertedWith("Max supply reached");
  });

  it("lets only the owner mint or revoke", async () => {
    const { badges, alice } = await deploy();
    await expect(badges.connect(alice).mintBadge(alice.address, 1)).to.be.revertedWithCustomError(
      badges,
      "OwnableUnauthorizedAccount",
    );
    await badges.mintBadge(alice.address, 1);
    await expect(badges.connect(alice).revokeBadge(1)).to.be.revertedWithCustomError(
      badges,
      "OwnableUnauthorizedAccount",
    );
  });

  it("revokes by burning, and the wallet cannot be minted the same badge again", async () => {
    const { badges, alice } = await deploy();
    await badges.mintBadge(alice.address, 1);

    await expect(badges.revokeBadge(1)).to.emit(badges, "BadgeRevoked").withArgs(1, 1, alice.address);
    expect(await badges.hasBadge(alice.address, 1)).to.equal(false);
    await expect(badges.ownerOf(1)).to.be.revertedWithCustomError(badges, "ERC721NonexistentToken");
    await expect(badges.mintBadge(alice.address, 1)).to.be.revertedWith("Wallet already has this badge");
  });

  it("rejects a badge type with no supply", async () => {
    const { badges } = await deploy();
    await expect(badges.createBadgeType(2, "Empty", "", "", 0)).to.be.revertedWith("Max supply must be positive");
  });
});
