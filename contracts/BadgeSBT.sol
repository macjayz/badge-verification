// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title BadgeSBT - Soulbound Token Contract for Badges
 * @dev Non-transferable ERC721 tokens for verified badges
 */
contract BadgeSBT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Badge structure
    struct Badge {
        string badgeKey;
        string metadataURI;
        address issuer;
        uint256 mintedAt;
        bool isRevoked;
    }

    // Mapping from token ID to Badge
    mapping(uint256 => Badge) public badges;

    // Mapping from badge key to whether it's active
    mapping(string => bool) public activeBadgeKeys;

    // Mapping from user to badge key to token ID (to prevent duplicates)
    mapping(address => mapping(string => uint256)) public userBadges;

    // Events
    event BadgeMinted(
        uint256 indexed tokenId,
        address indexed to,
        string badgeKey,
        string metadataURI,
        address indexed issuer
    );

    event BadgeRevoked(
        uint256 indexed tokenId,
        address revokedBy,
        string reason
    );

    event BadgeKeyActivated(string badgeKey, address activatedBy);
    event BadgeKeyDeactivated(string badgeKey, address deactivatedBy);

    constructor() ERC721("BadgeSBT", "BADGE") {}

    /**
     * @dev Mint a new soulbound badge to a user
     * @param to The recipient address
     * @param badgeKey Unique identifier for the badge type
     * @param metadataURI IPFS URI for badge metadata
     * @param issuer The address of the badge issuer
     */
    function mintBadge(
        address to,
        string calldata badgeKey,
        string calldata metadataURI,
        address issuer
    ) external onlyOwner returns (uint256) {
        require(activeBadgeKeys[badgeKey], "Badge key not active");
        require(userBadges[to][badgeKey] == 0, "User already has this badge");
        require(to != address(0), "Cannot mint to zero address");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        _mint(to, tokenId);

        // Store badge data
        badges[tokenId] = Badge({
            badgeKey: badgeKey,
            metadataURI: metadataURI,
            issuer: issuer,
            mintedAt: block.timestamp,
            isRevoked: false
        });

        // Track user badges to prevent duplicates
        userBadges[to][badgeKey] = tokenId;

        emit BadgeMinted(tokenId, to, badgeKey, metadataURI, issuer);
        return tokenId;
    }

    /**
     * @dev Revoke a badge (only owner)
     * @param tokenId The token ID to revoke
     * @param reason Reason for revocation
     */
    function revokeBadge(uint256 tokenId, string calldata reason) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        require(!badges[tokenId].isRevoked, "Badge already revoked");

        badges[tokenId].isRevoked = true;
        emit BadgeRevoked(tokenId, msg.sender, reason);
    }

    /**
     * @dev Activate a badge key for minting
     * @param badgeKey The badge key to activate
     */
    function activateBadgeKey(string calldata badgeKey) external onlyOwner {
        activeBadgeKeys[badgeKey] = true;
        emit BadgeKeyActivated(badgeKey, msg.sender);
    }

    /**
     * @dev Deactivate a badge key to prevent new mints
     * @param badgeKey The badge key to deactivate
     */
    function deactivateBadgeKey(string calldata badgeKey) external onlyOwner {
        activeBadgeKeys[badgeKey] = false;
        emit BadgeKeyDeactivated(badgeKey, msg.sender);
    }

    /**
     * @dev Override transfer functions to make tokens soulbound (non-transferable)
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        require(from == address(0) || to == address(0), "SBT: Token is soulbound and non-transferable");
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    /**
     * @dev Check if a user has a specific badge
     * @param user The user address
     * @param badgeKey The badge key to check
     * @return hasBadge Whether the user has the badge
     */
    function hasBadge(address user, string calldata badgeKey) external view returns (bool) {
        uint256 tokenId = userBadges[user][badgeKey];
        return tokenId != 0 && _exists(tokenId) && !badges[tokenId].isRevoked;
    }

    /**
     * @dev Get badge info for a token
     * @param tokenId The token ID
     * @return badgeKey The badge key
     * @return metadataURI The metadata URI
     * @return issuer The issuer address
     * @return mintedAt Mint timestamp
     * @return isRevoked Whether the badge is revoked
     */
    function getBadgeInfo(uint256 tokenId) external view returns (
        string memory badgeKey,
        string memory metadataURI,
        address issuer,
        uint256 mintedAt,
        bool isRevoked
    ) {
        require(_exists(tokenId), "Token does not exist");
        Badge memory badge = badges[tokenId];
        return (badge.badgeKey, badge.metadataURI, badge.issuer, badge.mintedAt, badge.isRevoked);
    }

    /**
     * @dev Get total minted badges count
     */
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter.current();
    }
}