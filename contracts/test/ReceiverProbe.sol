// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IBadgeSBTView {
    function hasBadge(address wallet, uint256 badgeTypeId) external view returns (bool);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/// @dev Test helper: a contract wallet that records what BadgeSBT reports while it is being minted to.
contract ReceiverProbe is IERC721Receiver {
    IBadgeSBTView public immutable badges;
    uint256 public immutable badgeTypeId;

    bool public sawBadge;
    string public sawTokenURI;

    constructor(IBadgeSBTView _badges, uint256 _badgeTypeId) {
        badges = _badges;
        badgeTypeId = _badgeTypeId;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        sawBadge = badges.hasBadge(address(this), badgeTypeId);
        sawTokenURI = badges.tokenURI(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Test helper: a contract that cannot receive ERC721 tokens.
contract NotAReceiver {}
