// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GameNFT - "Streak Champion" ERC721 for 5-Win Streaks
abstract contract GameNFT is ERC721URIStorage, Ownable {
    address public RPSGame;
    uint256 private _tokenIds;

    struct StreakData {
        address winner;
        uint256 amountWon;
    }

    mapping(address => uint256[]) public ownersTokens;
    mapping(uint256 => StreakData) public nftData;

    modifier onlyRPSGame() {
        require(msg.sender == RPSGame, "Not authorized");
        _;
    }

    constructor() ERC721("StreakChampion", "STRKCHAMP") {}

    function setRPSGame(address _game) external onlyOwner {
        require(_game != address(0), "Zero address");
        RPSGame = _game;
    }

    function mintChampionNFT(address to, uint256 amountWon, string memory tokenURI)
        external
        onlyRPSGame
        returns (uint256)
    {
        _tokenIds += 1;
        ownersTokens[to].push(_tokenIds);
        nftData[_tokenIds] = StreakData({winner: to, amountWon: amountWon});
        _mint(to, _tokenIds);
        _setTokenURI(_tokenIds, tokenURI);
        return _tokenIds;
    }

    function NftDescriptor(address player) external returns (StreakData memory) {}
}

//0xF812A1A3FeFAb70D80a4930023B730B58FAc7BD3
