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

  describe("soulbound standard (ERC-5192)", () => {
    it("locks every badge and says so when it is minted", async () => {
      const { badges, alice } = await deploy();
      await expect(badges.mintBadge(alice.address, 1)).to.emit(badges, "Locked").withArgs(1);
      expect(await badges.locked(1)).to.equal(true);
    });

    it("has no lock state for a badge that does not exist or was revoked", async () => {
      const { badges, alice } = await deploy();
      await expect(badges.locked(1)).to.be.revertedWithCustomError(badges, "ERC721NonexistentToken");
      await badges.mintBadge(alice.address, 1);
      await badges.revokeBadge(1);
      await expect(badges.locked(1)).to.be.revertedWithCustomError(badges, "ERC721NonexistentToken");
    });

    it("advertises ERC-5192, ERC-4906 and ERC-721 support", async () => {
      const { badges } = await deploy();
      expect(await badges.supportsInterface("0xb45a3c0e")).to.equal(true); // ERC-5192
      expect(await badges.supportsInterface("0x49064906")).to.equal(true); // ERC-4906
      expect(await badges.supportsInterface("0x80ac58cd")).to.equal(true); // ERC-721
      expect(await badges.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("approvals", () => {
    it("refuses approve and setApprovalForAll", async () => {
      const { badges, alice, bob } = await deploy();
      await badges.mintBadge(alice.address, 1);
      await expect(badges.connect(alice).approve(bob.address, 1)).to.be.revertedWith("SBT: approvals disabled");
      await expect(badges.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWith(
        "SBT: approvals disabled",
      );
      expect(await badges.getApproved(1)).to.equal(ethers.ZeroAddress);
      expect(await badges.isApprovedForAll(alice.address, bob.address)).to.equal(false);
    });

    it("cannot be moved with safeTransferFrom either", async () => {
      const { badges, alice, bob } = await deploy();
      await badges.mintBadge(alice.address, 1);
      await expect(
        badges.connect(alice)["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, 1),
      ).to.be.revertedWith("SBT: non-transferable");
      expect(await badges.ownerOf(1)).to.equal(alice.address);
    });
  });

  describe("metadata", () => {
    it("returns the badge type's metadata URI as the token URI", async () => {
      const { badges, alice } = await deploy();
      await badges.createBadgeType(2, "Verified Creator", "", "https://example.com/badges/2.json", 10);
      await badges.mintBadge(alice.address, 2);
      expect(await badges.tokenURI(1)).to.equal("https://example.com/badges/2.json");
    });

    it("has no token URI for a badge that does not exist", async () => {
      const { badges } = await deploy();
      await expect(badges.tokenURI(1)).to.be.revertedWithCustomError(badges, "ERC721NonexistentToken");
    });

    it("lets the owner change a badge type's metadata, and tells marketplaces to refresh", async () => {
      const { badges, alice } = await deploy();
      await badges.mintBadge(alice.address, 1);
      await expect(badges.setBadgeTypeMetadataUri(1, "ipfs://new/1.json"))
        .to.emit(badges, "BadgeTypeMetadataSet")
        .withArgs(1, "ipfs://new/1.json")
        .and.to.emit(badges, "BatchMetadataUpdate")
        .withArgs(1, 1);
      expect(await badges.tokenURI(1)).to.equal("ipfs://new/1.json");
      await expect(badges.connect(alice).setBadgeTypeMetadataUri(1, "x")).to.be.revertedWithCustomError(
        badges,
        "OwnableUnauthorizedAccount",
      );
      await expect(badges.setBadgeTypeMetadataUri(99, "x")).to.be.revertedWith("Badge type does not exist");
    });
  });

  describe("pausing a badge type", () => {
    it("stops and resumes minting without touching badges already held", async () => {
      const { badges, alice, bob } = await deploy();
      await badges.mintBadge(alice.address, 1);

      await expect(badges.setBadgeTypeActive(1, false)).to.emit(badges, "BadgeTypeActiveSet").withArgs(1, false);
      await expect(badges.mintBadge(bob.address, 1)).to.be.revertedWith("Badge type not active");
      expect(await badges.hasBadge(alice.address, 1)).to.equal(true);

      await badges.setBadgeTypeActive(1, true);
      await badges.mintBadge(bob.address, 1);
      expect(await badges.hasBadge(bob.address, 1)).to.equal(true);
    });

    it("is owner-only and needs an existing badge type", async () => {
      const { badges, alice } = await deploy();
      await expect(badges.connect(alice).setBadgeTypeActive(1, false)).to.be.revertedWithCustomError(
        badges,
        "OwnableUnauthorizedAccount",
      );
      await expect(badges.setBadgeTypeActive(99, false)).to.be.revertedWith("Badge type does not exist");
    });
  });

  describe("minting to contract wallets", () => {
    it("records the badge before the receiving contract is called", async () => {
      const { badges } = await deploy();
      await badges.setBadgeTypeMetadataUri(1, "ipfs://voter.json");
      const probe = await (await ethers.getContractFactory("ReceiverProbe")).deploy(await badges.getAddress(), 1);
      await badges.mintBadge(await probe.getAddress(), 1);
      expect(await probe.sawBadge()).to.equal(true);
      expect(await probe.sawTokenURI()).to.equal("ipfs://voter.json");
    });

    it("refuses a contract that cannot hold ERC721 tokens and leaves no trace", async () => {
      const { badges } = await deploy();
      const wallet = await (await ethers.getContractFactory("NotAReceiver")).deploy();
      const address = await wallet.getAddress();
      await expect(badges.mintBadge(address, 1)).to.be.revertedWithCustomError(badges, "ERC721InvalidReceiver");
      expect(await badges.hasMintedBadge(address, 1)).to.equal(false);
      expect((await badges.badgeTypes(1)).mintedCount).to.equal(0n);
    });
  });

  it("keeps supply counts and holdings consistent across many wallets and types", async () => {
    const { badges } = await deploy();
    await badges.createBadgeType(2, "Early Supporter", "", "", 5);
    const wallets = (await ethers.getSigners()).slice(3, 10);

    const held = new Set<string>();
    for (const [i, wallet] of wallets.entries()) {
      for (const type of [1, 2]) {
        const { maxSupply, mintedCount } = await badges.badgeTypes(type);
        if (mintedCount < maxSupply) {
          await badges.mintBadge(wallet.address, type);
          held.add(`${wallet.address}:${type}`);
        } else {
          await expect(badges.mintBadge(wallet.address, type)).to.be.revertedWith("Max supply reached");
        }
      }
      if (i % 3 === 0 && (await badges.hasBadge(wallet.address, 2))) {
        await badges.revokeBadge(await badges.badgeTokenOf(wallet.address, 2));
        held.delete(`${wallet.address}:2`);
      }
    }

    // Revoked badges still count toward supply: a revoked badge is not reissued.
    expect((await badges.badgeTypes(1)).mintedCount).to.equal(2n);
    expect((await badges.badgeTypes(2)).mintedCount).to.equal(5n);
    for (const wallet of wallets) {
      for (const type of [1, 2]) {
        expect(await badges.hasBadge(wallet.address, type)).to.equal(held.has(`${wallet.address}:${type}`));
      }
    }
  });
});
