// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RewardToken} from "./RewardToken.sol";
import {GameNFT} from "./GameNFT.sol";
import {MatchLib} from "./utils/MatchLib.sol";
import {Errors} from "./utils/Errors.sol";

/**
 * @title RPSGame - Main Rock-Paper-Scissors Betting Game Contract
 * @notice A decentralized rock-paper-scissors game with USDC betting, streak rewards, and NFT prizes
 * @dev Implements commit-reveal scheme for fair gameplay and anti-rematch protection
 */
contract RPSGame is ReentrancyGuard {
    using MatchLib for string;
    using MatchLib for MatchLib.Move;
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    /// @notice USDC token contract address
    address public immutable usdc;

    /// @notice Reward token contract for streak bonuses
    RewardToken public rewardToken;

    /// @notice NFT contract for champion rewards
    GameNFT public gameNFT;

    /// @notice Contract owner address
    address public owner;

    /// @notice Conversion factor for ETH to Wei
    uint256 private constant ETH_TO_WEI = 10 ** 18;

    /// @notice Available betting levels in USDC (18 decimals for internal calculations)
    uint256[] public betLevels = [1e18, 5e18, 10e18, 25e18, 50e18];

    /// @notice Player in-game USDC balances
    mapping(address => uint256) public playerBalance;

    /*//////////////////////////////////////////////////////////////
                            MATCH STRUCTURES
    //////////////////////////////////////////////////////////////*/
    /// @notice Match status enumeration
    enum MatchStatus {
        None,
        WaitingForJoin,
        WaitingForReveal,
        Resolved
    }

    /// @notice Match data structure
    struct Match {
        address creator; // Match creator address
        address joiner; // Match joiner address
        uint256 betAmount; // Bet amount in USDC
        bytes32 creatorHash; // Creator's move commitment hash
        bytes32 joinerHash; // Joiner's move commitment hash
        string creatorMove; // Creator's revealed move
        string joinerMove; // Joiner's revealed move
        bool creatorRevealed; // Creator reveal status
        bool joinerRevealed; // Joiner reveal status
        MatchStatus status; // Current match status
        uint256 createdAt; // Match creation timestamp
        uint256 resolvedAt; // Match resolution timestamp
    }

    /*//////////////////////////////////////////////////////////////
                       MATCH AND PLAYER TRACKING
    //////////////////////////////////////////////////////////////*/
    /// @notice Global match counter
    uint256 public matchCounter;

    /// @notice Match ID to match data mapping
    mapping(uint256 => Match) public matches;

    /// @notice Player address to their match IDs
    mapping(address => uint256[]) public playerMatches;

    /// @notice Recent opponent tracking for anti-rematch system
    mapping(address => address[]) public recentOpponents;

    /// @notice Match ID to winner address mapping
    mapping(uint256 => address) public matchIdToWinner;

    /*//////////////////////////////////////////////////////////////
                       STREAK AND REWARD TRACKING
    //////////////////////////////////////////////////////////////*/
    /// @notice Player current win streak count
    mapping(address => uint256) public winStreak;

    /// @notice Total amount won during current streak
    mapping(address => uint256) public winStreakAmountWon;

    /// @notice Last date player claimed streak reward
    mapping(address => uint256) public lastStreakRewardDate;

    /// @notice Number of NFTs owned by player
    mapping(address => uint256) public hasNFTs;

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/
    /// @notice Required streak length for rewards
    uint256 public constant STREAK_LENGTH = 5;

    /// @notice VCT reward amount per streak (100 VCT)
    uint256 public constant STREAK_REWARD_AMOUNT = 100e18;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    /// @notice Emitted when player deposits USDC
    event Deposited(address indexed player, uint256 amount);

    /// @notice Emitted when player withdraws USDC
    event Withdrawn(address indexed player, uint256 amount);

    /// @notice Emitted when new match is created
    event MatchCreated(uint256 indexed matchId, address creator, uint256 bet);

    /// @notice Emitted when player joins a match
    event MatchJoined(uint256 indexed matchId, address joiner);

    /// @notice Emitted when player reveals their move
    event Revealed(uint256 indexed matchId, address player, string move);

    /// @notice Emitted when match is resolved
    event MatchResolved(uint256 indexed matchId, address winner, address loser, uint8 result);

    /// @notice Emitted when streak reward is claimed
    event StreakReward(
        address indexed player, uint256 date, uint256 usdcStreakReward, uint256 vctAmount, uint256 tokenId
    );

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/
    /// @notice Restricts function access to contract owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Contract constructor
     * @param _usdc USDC token contract address
     * @param _rewardToken Reward token contract address
     * @param _gameNFT Game NFT contract address
     */
    constructor(address _usdc, address _rewardToken, address _gameNFT) {
        owner = msg.sender;
        usdc = _usdc;
        rewardToken = RewardToken(_rewardToken);
        gameNFT = GameNFT(_gameNFT);
    }

    /*//////////////////////////////////////////////////////////////
                    DEPOSIT AND WITHDRAWAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Deposit USDC into your in-game balance using permit
     * @param amount Amount to deposit (in USDC units, will be converted to wei)
     * @param deadline Permit deadline timestamp
     * @param v Permit signature component
     * @param r Permit signature component
     * @param s Permit signature component
     */
    function depositWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        amount = amount * ETH_TO_WEI;
        if (amount == 0) revert Errors.ZeroAmount();
        address _usdc = usdc;
        IERC20Permit(_usdc).permit(msg.sender, address(this), amount, deadline, v, r, s);
        if (IERC20(_usdc).transferFrom(msg.sender, address(this), amount)) {
            playerBalance[msg.sender] += amount;
        }
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from your in-game balance
     * @param amount Amount to withdraw (in USDC units, will be converted to wei)
     */
    function withdraw(uint256 amount) external nonReentrant {
        amount = amount * ETH_TO_WEI;
        if (playerBalance[msg.sender] < amount) {
            revert Errors.InsufficientBalance();
        }
        playerBalance[msg.sender] -= amount;
        (bool success) = IERC20(usdc).transfer(msg.sender, amount);
        if (!success) {
            revert Errors.WithdrawTransferFailed();
        }
        emit Withdrawn(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                       MATCH CREATION AND JOINING
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Create a new match by committing your move hash
     * @param betAmount Bet amount for the match
     * @param moveHash Keccak256 hash of (move + salt)
     * @return matchId The created match ID
     */
    function createMatch(uint256 betAmount, bytes32 moveHash) external nonReentrant returns (uint256) {
        betAmount = ETH_TO_WEI;
        if (!_isValidBet(betAmount)) revert Errors.InvalidBet();
        if (playerBalance[msg.sender] < betAmount) {
            revert Errors.InsufficientBalance();
        }
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
     * @notice Join an existing match with your move hash
     * @param matchId Match ID to join
     * @param moveHash Keccak256 hash of (move + salt)
     */
    function joinMatch(uint256 matchId, bytes32 moveHash) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.WaitingForJoin) {
            revert Errors.IncorrectMatchStatus();
        }
        if (msg.sender == m.creator) revert Errors.CreatorCannotJoin();
        if (moveHash == bytes32(0)) revert Errors.EmptyMove();
        if (playerBalance[msg.sender] < m.betAmount) {
            revert Errors.InsufficientBalance();
        }

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

    /*//////////////////////////////////////////////////////////////
                  MOVE REVEALING AND MATCH RESOLUTION
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Reveal your move and salt. If both have revealed, resolves match
     * @param matchId Match ID to reveal move for
     * @param move Your move ("rock", "paper", or "scissors")
     * @param salt Random salt used in commitment
     */
    function revealMove(uint256 matchId, string calldata move, string calldata salt) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.WaitingForReveal) {
            revert Errors.IncorrectMatchStatus();
        }

        address player = msg.sender;
        bytes32 commit = keccak256(abi.encodePacked(move, salt));
        if (player == m.creator) {
            if (bytes(m.creatorMove).length != 0) {
                revert Errors.AlreadyRevealed();
            }
            if (commit != m.creatorHash) revert Errors.InvalidReveal();
            m.creatorMove = move;
            m.creatorRevealed = true;
        } else if (player == m.joiner) {
            if (bytes(m.joinerMove).length != 0) {
                revert Errors.AlreadyRevealed();
            }
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
     * @dev Internal function to resolve match when both moves are revealed
     * @param matchId Match ID to resolve
     */
    function _resolveMatch(uint256 matchId) internal {
        Match storage m = matches[matchId];
        if (!m.creatorRevealed && m.joinerRevealed) {
            revert Errors.RevealIncomplete();
        }
        if (m.status != MatchStatus.WaitingForReveal) {
            revert Errors.IncorrectMatchStatus();
        }

        MatchLib.Move cMove = MatchLib.parseMove(m.creatorMove);
        MatchLib.Move jMove = MatchLib.parseMove(m.joinerMove);
        if (cMove == MatchLib.Move.None || jMove == MatchLib.Move.None) {
            revert Errors.InvalidMove();
        }

        // 0 = draw, 1 = creator wins, 2 = joiner wins
        uint8 outcome = MatchLib.determineWinner(cMove, jMove);
        address winner;
        address loser;
        uint256 bet = m.betAmount;

        // Update pairwise match history
        _updateRecentOpponents(m.creator, m.joiner);

        if (outcome == 0) {
            // Draw: refund both
            playerBalance[m.creator] += bet;
            playerBalance[m.joiner] += bet;

            // Reset Winstreak
            winStreak[m.creator] == 0;
            winStreak[m.joiner] == 0;
        } else {
            winner = (outcome == 1) ? m.creator : m.joiner;
            loser = (outcome == 1) ? m.joiner : m.creator;

            // Winner gets 1.75x bet, contract keeps 0.25x, loser gets 0
            uint256 prize = (bet * 175) / 100;
            playerBalance[winner] += prize;
            matchIdToWinner[matchId] = winner;
            // Handle streak logic
            _updateStreak(winner, loser, prize);
        }

        m.status = MatchStatus.Resolved;
        m.resolvedAt = block.timestamp;

        emit MatchResolved(matchId, winner, loser, outcome);
    }

    /*//////////////////////////////////////////////////////////////
                        STREAK AND REWARD LOGIC
    //////////////////////////////////////////////////////////////*/
    /**
     * @dev Update win streaks and handle streak rewards
     * @param winner Address of the match winner
     * @param loser Address of the match loser
     * @param amountWon Amount won in the match
     */
    function _updateStreak(address winner, address loser, uint256 amountWon) internal {
        winStreak[winner] += 1;
        winStreak[loser] = 0;

        amountWon += winStreakAmountWon[winner];
        winStreakAmountWon[loser] = 0;

        if (winStreak[winner] >= STREAK_LENGTH && _hasNotClaimedToday(winner)) {
            // Mint NFT
            uint256 tokenId = gameNFT.mintChampionNFT(winner, amountWon, "ipfs://champion-metadata");
            hasNFTs[winner] += 1;
            lastStreakRewardDate[winner] = _currentDay();

            uint256 streakReward = (amountWon * 25) / 175;

            IERC20(usdc).transfer(msg.sender, streakReward);

            // Mint VictoryToken reward
            rewardToken.mint(winner, STREAK_REWARD_AMOUNT);

            // Mark claim date
            emit StreakReward(winner, lastStreakRewardDate[winner], streakReward, STREAK_REWARD_AMOUNT, tokenId);
        }
    }

    /**
     * @dev Check if player has not claimed streak reward today
     * @param player Player address to check
     * @return bool True if player hasn't claimed today
     */
    function _hasNotClaimedToday(address player) internal view returns (bool) {
        return lastStreakRewardDate[player] < _currentDay();
    }

    /**
     * @dev Get current day as timestamp divided by 1 day
     * @return uint256 Current day number
     */
    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /*//////////////////////////////////////////////////////////////
                          ANTI-REMATCH SYSTEM
    //////////////////////////////////////////////////////////////*/
    /**
     * @dev Require that two players haven't played recently (anti-rematch protection)
     * @param a First player address
     * @param b Second player address
     */
    function _requireNoRecentRematch(address a, address b) internal view {
        address[] memory oppA = recentOpponents[a];
        uint8 counter = 0;
        if (oppA.length > 0) {
            for (uint256 i = oppA.length - 1; i > 0; i--) {
                if (oppA[i] == b) revert Errors.RematchBeforeFiveMatches();
                counter++;
                if (counter == 5) break;
            }
        }
    }

    /**
     * @dev Update recent opponents list for both players
     * @param a First player address
     * @param b Second player address
     */
    function _updateRecentOpponents(address a, address b) internal {
        _pushRecentOpponent(a, b);
        _pushRecentOpponent(b, a);
    }

    /**
     * @dev Add opponent to player's recent opponents list (max 5)
     * @param player Player address
     * @param opp Opponent address to add
     */
    function _pushRecentOpponent(address player, address opp) internal {
        address[] storage arr = recentOpponents[player];
        arr.push(opp);
        if (arr.length > 5) {
            // Only keep last 5
            for (uint256 i = 0; i < arr.length - 1; i++) {
                arr[i] = arr[i + 1];
            }
            arr.pop();
        }
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Get player's current in-game balance
     * @param player Player address
     * @return uint256 Player's balance in USDC wei
     */
    function getPlayerBalance(address player) external view returns (uint256) {
        return playerBalance[player];
    }

    /**
     * @dev Check if bet amount is valid according to predefined levels
     * @param val Bet amount to validate
     * @return bool True if bet amount is valid
     */
    function _isValidBet(uint256 val) internal view returns (bool) {
        for (uint256 i = 0; i < betLevels.length; i++) {
            if (betLevels[i] == val) return true;
        }
        return false;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Set new reward token contract (owner only)
     * @param _reward New reward token contract address
     */
    function setRewardToken(address _reward) external onlyOwner {
        require(_reward != address(0), "Zero address");
        rewardToken = RewardToken(_reward);
    }

    /**
     * @notice Set new game NFT contract (owner only)
     * @param _nft New game NFT contract address
     */
    function setGameNFT(address _nft) external onlyOwner {
        require(_nft != address(0), "Zero address");
        gameNFT = GameNFT(_nft);
    }
}
