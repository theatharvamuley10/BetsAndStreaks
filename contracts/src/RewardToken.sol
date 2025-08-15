// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VictoryToken - ERC20 Reward for Streaks
abstract contract RewardToken is ERC20, Ownable {
    address public RPSGame;

    modifier onlyRPSGame() {
        require(msg.sender == RPSGame, "Not authorized");
        _;
    }

    constructor() ERC20("VictoryToken", "VCT") {}

    function setRPSGame(address _game) external onlyOwner {
        require(_game != address(0), "Zero address");
        RPSGame = _game;
    }

    function mint(address to, uint256 amount) external onlyRPSGame {
        _mint(to, amount);
    }
}

//0x546788eAD6eeB829964B30a2D8aF12dFdd930358
