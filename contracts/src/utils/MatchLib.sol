// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MatchLib - Pure functions to handle RPS logic.
library MatchLib {
    enum Move {
        None,
        Rock,
        Paper,
        Scissors
    }

    // Returns: 0 = draw, 1 = player1 wins, 2 = player2 wins
    function determineWinner(Move p1, Move p2) internal pure returns (uint8) {
        if (p1 == p2) return 0;
        if (
            (p1 == Move.Rock && p2 == Move.Scissors) ||
            (p1 == Move.Paper && p2 == Move.Rock) ||
            (p1 == Move.Scissors && p2 == Move.Paper)
        ) {
            return 1;
        }
        return 2;
    }

    // Parses string to Move enum, returns Move.None if invalid
    function parseMove(string memory moveStr) internal pure returns (Move) {
        bytes32 hash = keccak256(bytes(moveStr));
        if (hash == keccak256("rock")) return Move.Rock;
        if (hash == keccak256("paper")) return Move.Paper;
        if (hash == keccak256("scissors")) return Move.Scissors;
        return Move.None;
    }
}
