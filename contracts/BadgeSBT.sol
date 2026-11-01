// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BadgeSBT
 * @notice Non-transferable (soulbound) ERC721 badges. Only the owner, the backend's minting key,
 *         can mint or revoke. A wallet can hold each badge type at most once, and a revoked
 *         badge cannot be minted to the same wallet again.
 */
contract BadgeSBT is ERC721, Ownable {
    // Token ids start at 1 so that 0 can mean "none" in badgeTokenOf.
    uint256 private _nextTokenId = 1;

    // Badge type information
    struct BadgeType {
        string name;
        string description;
        string imageUri;
        bool isActive;
        uint256 maxSupply;
        uint256 mintedCount;
    }

    // Token metadata
    struct TokenInfo {
        uint256 badgeTypeId;
        uint256 mintedAt;
        address mintedBy;
    }

    // Mapping from badge type ID to BadgeType
    mapping(uint256 => BadgeType) public badgeTypes;

    // Mapping from token ID to TokenInfo
    mapping(uint256 => TokenInfo) public tokenInfo;

    // Wallet => badge type => whether it was ever minted (stays true after revocation).
    mapping(address => mapping(uint256 => bool)) public hasMintedBadge;

    // Wallet => badge type => token id currently held, or 0.
    mapping(address => mapping(uint256 => uint256)) public badgeTokenOf;

    event BadgeTypeCreated(uint256 indexed badgeTypeId, string name, string description);
    event BadgeMinted(
        uint256 indexed tokenId,
        uint256 indexed badgeTypeId,
        address indexed to,
        address mintedBy
    );
    event BadgeRevoked(uint256 indexed tokenId, uint256 indexed badgeTypeId, address indexed from);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}

    /// @notice Registers a badge type. maxSupply must be at least 1.
    function createBadgeType(
        uint256 badgeTypeId,
        string memory name,
        string memory description,
        string memory imageUri,
        uint256 maxSupply
    ) external onlyOwner {
        require(maxSupply > 0, "Max supply must be positive");
        require(badgeTypes[badgeTypeId].maxSupply == 0, "Badge type already exists");

        badgeTypes[badgeTypeId] = BadgeType({
            name: name,
            description: description,
            imageUri: imageUri,
            isActive: true,
            maxSupply: maxSupply,
            mintedCount: 0
        });

        emit BadgeTypeCreated(badgeTypeId, name, description);
    }

    /// @notice Mints a badge of the given type to `to` and returns its token id.
    function mintBadge(
        address to,
        uint256 badgeTypeId
    ) external onlyOwner returns (uint256) {
        require(badgeTypes[badgeTypeId].isActive, "Badge type not active");
        require(!hasMintedBadge[to][badgeTypeId], "Wallet already has this badge");
        require(
            badgeTypes[badgeTypeId].mintedCount < badgeTypes[badgeTypeId].maxSupply,
            "Max supply reached"
        );

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(to, tokenId);

        tokenInfo[tokenId] = TokenInfo({
            badgeTypeId: badgeTypeId,
            mintedAt: block.timestamp,
            mintedBy: msg.sender
        });

        hasMintedBadge[to][badgeTypeId] = true;
        badgeTokenOf[to][badgeTypeId] = tokenId;
        badgeTypes[badgeTypeId].mintedCount++;

        emit BadgeMinted(tokenId, badgeTypeId, to, msg.sender);

        return tokenId;
    }

    /// @notice Burns a badge. The holder cannot be minted the same badge type again.
    function revokeBadge(uint256 tokenId) external onlyOwner {
        address holder = _requireOwned(tokenId);
        uint256 badgeTypeId = tokenInfo[tokenId].badgeTypeId;

        _burn(tokenId);
        delete badgeTokenOf[holder][badgeTypeId];

        emit BadgeRevoked(tokenId, badgeTypeId, holder);
    }

    /// @dev Minting (from == 0) and burning (to == 0) are the only allowed moves.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "SBT: non-transferable");
        return super._update(to, tokenId, auth);
    }

    /// @notice Whether `wallet` currently holds a badge of this type (false after revocation).
    function hasBadge(address wallet, uint256 badgeTypeId) external view returns (bool) {
        return badgeTokenOf[wallet][badgeTypeId] != 0;
    }
}