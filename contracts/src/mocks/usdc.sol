// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDC is ERC20Permit {
    address constant ME = 0x88BCe67C0259107003B2178f920fB898C65b97ea;

    constructor() ERC20Permit("USD Coin") ERC20("USD Coin", "USDC") {
        _mint(ME, 100000 * (10 ** decimals()));
    }
}

// 0x7eAb7eDF2b6e43BeE8ed13B07b63Aa1baD5914f1
