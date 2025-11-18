// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BadgeSBT - Soulbound Badge Token
 * @dev Non-transferable ERC721 tokens for verifiable badges
 */
contract BadgeSBT is ERC721, Ownable {
    uint256 private _nextTokenId = 1; // Start token IDs from 1
    
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
    
    // Mapping from wallet to badge type to track if already minted
    mapping(address => mapping(uint256 => bool)) public hasMintedBadge;
    
    // Events
    event BadgeTypeCreated(uint256 indexed badgeTypeId, string name, string description);
    event BadgeMinted(
        uint256 indexed tokenId,
        uint256 indexed badgeTypeId,
        address indexed to,
        address mintedBy
    );
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}
    
    // ... rest of the contract remains the same
    /**
     * @dev Create a new badge type (only owner)
     */
    function createBadgeType(
        uint256 badgeTypeId,
        string memory name,
        string memory description,
        string memory imageUri,
        uint256 maxSupply
    ) external onlyOwner {
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
    
    /**
     * @dev Mint a badge to a wallet (only owner)
     */
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
        badgeTypes[badgeTypeId].mintedCount++;
        
        emit BadgeMinted(tokenId, badgeTypeId, to, msg.sender);
        
        return tokenId;
    }
    
    /**
     * @dev Override transfer functions to make tokens soulbound (non-transferable)
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "SBT: non-transferable");
        return super._update(to, tokenId, auth);
    }
    
    /**
     * @dev Check if wallet has a specific badge type
     */
    function hasBadge(address wallet, uint256 badgeTypeId) external view returns (bool) {
        return hasMintedBadge[wallet][badgeTypeId];
    }
}