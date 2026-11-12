// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal soulbound token interface (ERC-5192).
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title BadgeSBT
 * @notice Non-transferable (soulbound) ERC721 badges. Only the owner, the backend's minting key,
 *         can mint or revoke. A wallet can hold each badge type at most once, and a revoked
 *         badge cannot be minted to the same wallet again. Every badge is permanently locked
 *         (ERC-5192), so approvals are refused as well as transfers.
 */
contract BadgeSBT is ERC721, Ownable, IERC5192 {
    // Token ids start at 1 so that 0 can mean "none" in badgeTokenOf.
    uint256 private _nextTokenId = 1;

    // Badge type information
    struct BadgeType {
        string name;
        string description;
        string metadataUri;
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
    event BadgeTypeActiveSet(uint256 indexed badgeTypeId, bool isActive);
    event BadgeTypeMetadataSet(uint256 indexed badgeTypeId, string metadataUri);
    event BadgeMinted(
        uint256 indexed tokenId,
        uint256 indexed badgeTypeId,
        address indexed to,
        address mintedBy
    );
    event BadgeRevoked(uint256 indexed tokenId, uint256 indexed badgeTypeId, address indexed from);

    /// @dev ERC-4906: tells marketplaces to refresh the metadata of a range of tokens.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}

    /// @notice Registers a badge type. maxSupply must be at least 1. `metadataUri` points to the
    ///         badge's ERC721 metadata JSON and is returned by tokenURI for every badge of this type.
    function createBadgeType(
        uint256 badgeTypeId,
        string memory name,
        string memory description,
        string memory metadataUri,
        uint256 maxSupply
    ) external onlyOwner {
        require(maxSupply > 0, "Max supply must be positive");
        require(badgeTypes[badgeTypeId].maxSupply == 0, "Badge type already exists");

        badgeTypes[badgeTypeId] = BadgeType({
            name: name,
            description: description,
            metadataUri: metadataUri,
            isActive: true,
            maxSupply: maxSupply,
            mintedCount: 0
        });

        emit BadgeTypeCreated(badgeTypeId, name, description);
    }

    /// @notice Pauses or resumes minting of a badge type. Badges already minted are unaffected.
    function setBadgeTypeActive(uint256 badgeTypeId, bool isActive) external onlyOwner {
        require(badgeTypes[badgeTypeId].maxSupply != 0, "Badge type does not exist");
        badgeTypes[badgeTypeId].isActive = isActive;
        emit BadgeTypeActiveSet(badgeTypeId, isActive);
    }

    /// @notice Changes the metadata URI of a badge type, including for badges already minted.
    function setBadgeTypeMetadataUri(uint256 badgeTypeId, string memory metadataUri) external onlyOwner {
        require(badgeTypes[badgeTypeId].maxSupply != 0, "Badge type does not exist");
        badgeTypes[badgeTypeId].metadataUri = metadataUri;
        emit BadgeTypeMetadataSet(badgeTypeId, metadataUri);
        if (_nextTokenId > 1) emit BatchMetadataUpdate(1, _nextTokenId - 1);
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

        // Record everything before _safeMint, which calls into `to` if it is a contract.
        tokenInfo[tokenId] = TokenInfo({
            badgeTypeId: badgeTypeId,
            mintedAt: block.timestamp,
            mintedBy: msg.sender
        });
        hasMintedBadge[to][badgeTypeId] = true;
        badgeTokenOf[to][badgeTypeId] = tokenId;
        badgeTypes[badgeTypeId].mintedCount++;

        _safeMint(to, tokenId);

        emit BadgeMinted(tokenId, badgeTypeId, to, msg.sender);
        emit Locked(tokenId);

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

    /// @notice Whether `wallet` currently holds a badge of this type (false after revocation).
    function hasBadge(address wallet, uint256 badgeTypeId) external view returns (bool) {
        return badgeTokenOf[wallet][badgeTypeId] != 0;
    }

    /// @notice Always true for an existing badge: badges can never be transferred (ERC-5192).
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @notice The metadata URI of the badge's type. Empty if the type has none.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return badgeTypes[tokenInfo[tokenId].badgeTypeId].metadataUri;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        // 0x49064906 is ERC-4906 (metadata update events).
        return interfaceId == type(IERC5192).interfaceId || interfaceId == bytes4(0x49064906)
            || super.supportsInterface(interfaceId);
    }

    /// @dev A badge can never be moved, so nobody may be approved to move it.
    function approve(address, uint256) public pure override {
        revert("SBT: approvals disabled");
    }

    /// @dev See {approve}.
    function setApprovalForAll(address, bool) public pure override {
        revert("SBT: approvals disabled");
    }

    /// @dev Minting (from == 0) and burning (to == 0) are the only allowed moves.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "SBT: non-transferable");
        return super._update(to, tokenId, auth);
    }
}
