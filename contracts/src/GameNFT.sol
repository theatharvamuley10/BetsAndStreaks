// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GameNFT - "Streak Champion" ERC721 for 5-Win Streaks
abstract contract GameNFT is ERC721URIStorage, Ownable {
    address public RPSGame;
    uint256 private _tokenIds;

    modifier onlyRPSGame() {
        require(msg.sender == RPSGame, "Not authorized");
        _;
    }

    constructor() ERC721("StreakChampion", "STCHAMP") {}

    function setRPSGame(address _game) external onlyOwner {
        require(_game != address(0), "Zero address");
        RPSGame = _game;
    }

    function mintChampionNFT(
        address to,
        string memory tokenURI
    ) external onlyRPSGame returns (uint256) {
        _tokenIds += 1;
        _mint(to, _tokenIds);
        _setTokenURI(_tokenIds, tokenURI);
        return _tokenIds;
    }
}
