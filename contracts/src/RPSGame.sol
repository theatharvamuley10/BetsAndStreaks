// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RewardToken} from "./RewardToken.sol";
import {GameNFT} from "./GameNFT.sol";
import {MatchLib} from "./utils/MatchLib.sol";
import {Errors} from "contracts/src/utils/Errors.sol";

/// @title RPSGame - Main Rock-Paper-Scissors Betting Game Contract
contract RPSGame is ReentrancyGuard {
    using MatchLib for string;
    using MatchLib for MatchLib.Move;
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    RewardToken public rewardToken;
    GameNFT public gameNFT;
    address public owner;

    // Betting levels in USDC (6 decimals)
    uint256[] public betLevels = [
        1e6,
        5e6,
        10e6,
        25e6,
        50e6,
        100e6,
        200e6,
        500e6,
        1000e6
    ];

    // In-game balances
    mapping(address => uint256) public playerBalance;

    // Matching & Match Info
    enum MatchStatus {
        None,
        WaitingForJoin,
        WaitingForReveal,
        Resolved
    }
    struct Match {
        address creator;
        address joiner;
        uint256 betAmount;
        bytes32 creatorHash;
        bytes32 joinerHash;
        string creatorMove; // revealed
        string joinerMove; // revealed
        bool creatorRevealed;
        bool joinerRevealed;
        MatchStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
    }
    uint256 public matchCounter;
    mapping(uint256 => Match) public matches;

    // Player match mapping
    mapping(address => uint256[]) public playerMatches;

    // Pairwise match history: player => opponent => recent opponents
    mapping(address => address[]) public recentOpponents;

    // Streaks & claims
    mapping(address => uint256) public winStreak;
    mapping(address => uint256) public lastStreakRewardDate;
    mapping(address => bool) public hasChampionNFT;

    // Configs
    uint256 public constant STREAK_LENGTH = 5;
    uint256 public constant STREAK_REWARD_AMOUNT = 100e18; // 100 VCT per streak

    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event MatchCreated(uint256 indexed matchId, address creator, uint256 bet);
    event MatchJoined(uint256 indexed matchId, address joiner);
    event Revealed(uint256 indexed matchId, address player, string move);
    event MatchResolved(
        uint256 indexed matchId,
        address winner,
        address loser,
        uint8 result
    );
    event StreakReward(
        address indexed player,
        uint256 date,
        uint256 vctAmount,
        uint256 tokenId
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc, address _rewardToken, address _gameNFT) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        rewardToken = RewardToken(_rewardToken);
        gameNFT = GameNFT(_gameNFT);
    }

    // --- Deposit and Withdraw ---

    /**
     * @notice Deposit USDC into your in-game balance.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert Errors.ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount))
            revert Errors.DepositTransferFailed();

        playerBalance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw any available in-game balance.
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (playerBalance[msg.sender] < amount)
            revert Errors.InsufficientBalance();
        playerBalance[msg.sender] -= amount;
        if (!usdc.transfer(msg.sender, amount))
            revert Errors.WithdrawTransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // --- Match Flow: Create > Join > Reveal > Resolve ---

    /**
     * @notice Create a new match by committing your move hash.
     */
    function createMatch(
        uint256 betAmount,
        bytes32 moveHash
    ) external nonReentrant returns (uint256) {
        if (!_isValidBet(betAmount)) revert Errors.InvalidBet();
        if (playerBalance[msg.sender] < betAmount)
            revert Errors.InsufficientBalance();
        if (moveHash == bytes32(0)) revert Errors.EmptyMove();

        // Lock bet
        playerBalance[msg.sender] -= betAmount;

        // Track new match
        matchCounter += 1;
        Match memory m;
        m.creator = msg.sender;
        m.betAmount = betAmount;
        m.creatorHash = moveHash;
        m.status = MatchStatus.WaitingForJoin;
        m.createdAt = block.timestamp;

        matches[matchCounter] = m;

        playerMatches[msg.sender].push(matchCounter);
        emit MatchCreated(matchCounter, msg.sender, betAmount);

        return matchCounter;
    }

    /**
     * @notice Join an existing match with your move hash.
     * @param matchId Equivalent to match counter.
     */
    function joinMatch(
        uint256 matchId,
        bytes32 moveHash
    ) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.WaitingForJoin)
            revert Errors.IncorrectMatchStatus();
        if (msg.sender == m.creator) revert Errors.CreatorCannotJoin();
        if (moveHash == bytes32(0)) revert Errors.EmptyMove();
        if (playerBalance[msg.sender] < m.betAmount)
            revert Errors.InsufficientBalance();

        // Cannot rematch recent opponent
        _requireNoRecentRematch(msg.sender, m.creator);
        _requireNoRecentRematch(m.creator, msg.sender);

        // Lock joiner's bet
        playerBalance[msg.sender] -= m.betAmount;
        m.joiner = msg.sender;
        m.joinerHash = moveHash;
        m.status = MatchStatus.WaitingForReveal;

        playerMatches[msg.sender].push(matchId);

        emit MatchJoined(matchId, msg.sender);
    }

    /**
     * @notice Reveal your move and salt. If both have revealed, resolves match.
     */
    function revealMove(
        uint256 matchId,
        string calldata move,
        string calldata salt
    ) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.WaitingForReveal)
            revert Errors.IncorrectMatchStatus();

        address player = msg.sender;
        bytes32 commit = keccak256(abi.encodePacked(move, salt));
        if (player == m.creator) {
            if (bytes(m.creatorMove).length != 0)
                revert Errors.AlreadyRevealed();
            if (commit != m.creatorHash) revert Errors.InvalidReveal();
            m.creatorMove = move;
            m.creatorRevealed = true;
        } else if (player == m.joiner) {
            if (bytes(m.joinerMove).length != 0)
                revert Errors.AlreadyRevealed();
            if (commit != m.joinerHash) revert Errors.InvalidReveal();
            m.joinerMove = move;
            m.joinerRevealed = true;
        } else {
            revert Errors.NotAPlayer();
        }

        emit Revealed(matchId, player, move);

        // If both revealed, resolve
        if (m.creatorRevealed && m.joinerRevealed) {
            _resolveMatch(matchId);
        }
    }

    /**
     * @dev Internal: resolve the match when both moves revealed.
     */
    function _resolveMatch(uint256 matchId) internal {
        Match storage m = matches[matchId];
        if (!m.creatorRevealed && m.joinerRevealed)
            revert Errors.RevealIncomplete();
        if (m.status != MatchStatus.WaitingForReveal)
            revert Errors.IncorrectMatchStatus();

        MatchLib.Move cMove = MatchLib.parseMove(m.creatorMove);
        MatchLib.Move jMove = MatchLib.parseMove(m.joinerMove);
        if (cMove == MatchLib.Move.None || jMove == MatchLib.Move.None)
            revert Errors.InvalidMove();

        // 0 = draw, 1 = creator wins, 2 = joiner wins
        uint8 outcome = MatchLib.determineWinner(cMove, jMove);
        address winner;
        address loser;
        uint256 bet = m.betAmount;

        if (outcome == 0) {
            // Draw: refund both
            playerBalance[m.creator] += bet;
            playerBalance[m.joiner] += bet;
        } else {
            winner = (outcome == 1) ? m.creator : m.joiner;
            loser = (outcome == 1) ? m.joiner : m.creator;

            // Winner gets 1.75x bet, contract keeps 0.25x, loser gets 0
            uint256 prize = (bet * 175) / 100;
            playerBalance[winner] += prize;
            // Handle streak logic
            _updateStreak(winner, loser);
        }

        // Update pairwise match history
        _updateRecentOpponents(m.creator, m.joiner);

        m.status = MatchStatus.Resolved;
        m.resolvedAt = block.timestamp;

        emit MatchResolved(matchId, winner, loser, outcome);
    }

    // --- Streak & Reward Logic ---

    function _updateStreak(address winner, address loser) internal {
        winStreak[winner] += 1;
        winStreak[loser] = 0;

        if (
            winStreak[winner] >= STREAK_LENGTH &&
            _hasNotClaimedToday(winner) &&
            !hasChampionNFT[winner]
        ) {
            // Mint NFT
            uint256 tokenId = gameNFT.mintChampionNFT(
                winner,
                "ipfs://champion-metadata"
            );
            hasChampionNFT[winner] = true;

            // Mint VictoryToken reward
            rewardToken.mint(winner, STREAK_REWARD_AMOUNT);

            // Mark claim date
            lastStreakRewardDate[winner] = _currentDay();
            emit StreakReward(
                winner,
                lastStreakRewardDate[winner],
                STREAK_REWARD_AMOUNT,
                tokenId
            );
        }
    }

    function _hasNotClaimedToday(address player) internal view returns (bool) {
        return lastStreakRewardDate[player] < _currentDay();
    }

    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // ---- Recent Opponent Management (No Rematch Rule) ----

    function _requireNoRecentRematch(address a, address b) internal view {
        address[] memory oppA = recentOpponents[a];
        uint8 counter = 0;
        if (oppA.length > 0) {
            for (uint i = oppA.length - 1; i > 0; i--) {
                if (oppA[i] == b) revert Errors.RematchBeforeFiveMatches();
                counter++;
                if (counter == 5) break;
            }
        }
    }

    function _updateRecentOpponents(address a, address b) internal {
        _pushRecentOpponent(a, b);
        _pushRecentOpponent(b, a);
    }

    function _pushRecentOpponent(address player, address opp) internal {
        address[] storage arr = recentOpponents[player];
        arr.push(opp);
        if (arr.length > 5) {
            // Only keep last 5
            for (uint i = 0; i < arr.length - 1; i++) {
                arr[i] = arr[i + 1];
            }
            arr.pop();
        }
    }

    // ---- Utility ----

    function _isValidBet(uint256 val) internal view returns (bool) {
        for (uint i = 0; i < betLevels.length; i++) {
            if (betLevels[i] == val) return true;
        }
        return false;
    }

    // ---- Admin ----

    function setRewardToken(address _reward) external onlyOwner {
        require(_reward != address(0), "Zero address");
        rewardToken = RewardToken(_reward);
    }

    function setGameNFT(address _nft) external onlyOwner {
        require(_nft != address(0), "Zero address");
        gameNFT = GameNFT(_nft);
    }
}
