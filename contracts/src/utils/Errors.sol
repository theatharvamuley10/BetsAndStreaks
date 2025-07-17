//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

library Errors {
    error ZeroAmount();

    error DepositTransferFailed();

    error WithdrawTransferFailed();

    error InsufficientBalance();

    error InvalidBet();

    error EmptyMove();

    error InvalidMatchId();

    error IncorrectMatchStatus();

    error CreatorCannotJoin();

    error RematchBeforeFiveMatches();

    error NotAPlayer();

    error AlreadyRevealed();

    error InvalidReveal();

    error RevealIncomplete();

    error InvalidMove();
}
