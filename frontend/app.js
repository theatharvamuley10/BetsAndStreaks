/**
 * @file RPS Game Frontend - Client-side logic for Rock Paper Scissors blockchain game
 * @description Handles wallet connection, USDC deposits/withdrawals, and game interactions
 * @author [Your Team]
 * @version 2.0.0
 */

// ===================================================================================
//                                  IMPORTS
// ===================================================================================

import {
  createWalletClient,
  custom,
  parseSignature,
  createPublicClient,
  formatEther,
  parseEther,
  keccak256,
  encodePacked,
} from "https://esm.sh/viem";
import { sepolia } from "https://esm.sh/viem/chains";
import {
  CONTRACT_ADDRESS,
  USDC_ADDRESS,
  abi,
  usdcAbi,
} from "./constants-js.js";

// ===================================================================================
//                                  STATE VARIABLES
// ===================================================================================

let walletClient;
let connectedAccount;

// ===================================================================================
//                                  INITIALIZATION
// ===================================================================================

/**
 * Initialize the application and check for existing wallet connection
 */
function init() {
  if (!window.ethereum) {
    alert("MetaMask is not installed!");
    return;
  }

  walletClient = createWalletClient({
    transport: custom(window.ethereum),
  });

  // Check for existing connection
  window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
    if (accounts.length > 0) {
      connectedAccount = accounts[0];
      updateUI();
    } else {
      document.getElementById("connectWalletBtn").innerText = "Connect Wallet";
    }
  });
}

// ===================================================================================
//                                  UI UTILITIES
// ===================================================================================

/**
 * Update UI to reflect current wallet connection state
 */
function updateUI() {
  document.getElementById("connectWalletBtn").innerText =
    shortenAddress(connectedAccount);
  updateBalance();
}

/**
 * Shorten Ethereum address for display
 */
function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ===================================================================================
//                                  UTILITY FUNCTIONS
// ===================================================================================

/**
 * Convert move string to number for contract interaction
 */
function moveToNumber(move) {
  const moves = { rock: 0, paper: 1, scissors: 2 };
  return moves[move.toLowerCase()];
}

/**
 * Convert move number to string for display
 */
function numberToMove(move) {
  const moves = ["Rock", "Paper", "Scissors"];
  return moves[move] || "Unknown";
}

/**
 * Create commitment hash for move using keccak256
 */
function createCommitment(move, salt) {
  return keccak256(encodePacked(["string", "string"], [move, salt]));
}

// ===================================================================================
//                                  WALLET CONNECTION
// ===================================================================================

/**
 * Connect user wallet via MetaMask
 */
async function connectWallet() {
  if (!walletClient) return alert("Wallet not initialized");

  const accounts = await walletClient.requestAddresses();
  connectedAccount = accounts[0];
  updateUI();
}

/**
 * Get player's USDC balance from smart contract
 */
async function getPlayerBalance(address) {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom(window.ethereum),
  });

  return await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi,
    functionName: "getPlayerBalance",
    args: [address],
  });
}

/**
 * Update balance display in UI
 */
async function updateBalance() {
  if (!connectedAccount) return;
  const rawBalance = await getPlayerBalance(connectedAccount);
  document.getElementById("balance").innerText = `Balance: ${formatEther(
    rawBalance
  )} USDC`;
}

// ===================================================================================
//                                  DEPOSIT FUNCTIONALITY
// ===================================================================================

/**
 * Deposit USDC using EIP-2612 permit standard
 */
async function deposit() {
  console.log("Starting deposit process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    let depositAmount = document.getElementById("usdcAmount").value;
    depositAmount = Number(parseEther(depositAmount));
    console.log(`Deposit amount in wei: ${depositAmount}`);

    // Fetch current nonce for EIP-2612 permit
    const nonce = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: "nonces",
      args: [userAddress],
    });
    console.log(`USDC nonce for user: ${nonce}`);

    // Set deadline for permit (30 minutes)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    console.log(`Permit deadline (timestamp): ${deadline}`);

    // Define EIP-712 typed data for permit signature
    const domain = {
      name: "USD Coin",
      version: "1",
      chainId: sepolia.id,
      verifyingContract: USDC_ADDRESS,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      owner: userAddress,
      spender: CONTRACT_ADDRESS,
      value: depositAmount,
      nonce: nonce,
      deadline: deadline,
    };

    // Request user signature
    console.log("Requesting signature from user...");
    const signatureHex = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });
    console.log("Signature received.");

    // Split signature into v, r, s components
    const { v, r, s } = parseSignature(signatureHex);

    // Send transaction to smart contract
    depositBtn.innerHTML = "Sending transaction...";
    console.log("Sending transaction to depositWithPermit...");
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "depositWithPermit",
      args: [depositAmount, deadline, v, r, s],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);
    updateBalance();

    depositBtn.innerHTML = "Deposit";
    return txHash;
  } catch (error) {
    console.error("An error occurred during the deposit process:", error);
    depositBtn.innerHTML = "Deposit";
    throw error;
  }
}

// ===================================================================================
//                                  WITHDRAW FUNCTIONALITY
// ===================================================================================

/**
 * Withdraw USDC from smart contract to user wallet
 */
async function withdraw() {
  console.log("Starting withdraw process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // Get and validate withdrawal amount
    let amountToWithdraw = document.getElementById("usdcAmount").value;
    if (!amountToWithdraw || parseFloat(amountToWithdraw) <= 0) {
      withdrawBtn.innerHTML = "Please enter a valid amount to withdraw.";
      return;
    }
    amountToWithdraw = Number(parseEther(amountToWithdraw));

    withdrawBtn.innerHTML = "Sending transaction...";

    // Call smart contract's withdraw function
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "withdraw",
      args: [amountToWithdraw],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);
    updateBalance();

    withdrawBtn.innerHTML = "Withdraw";
    return txHash;
  } catch (error) {
    console.error("An error occurred during the withdraw process:", error);
    withdrawBtn.innerHTML = "Withdraw";
    throw error;
  }
}

// ===================================================================================
//                                  CREATE MATCH
// ===================================================================================

/**
 * Create new Rock Paper Scissors match with commitment hash
 */
async function createMatch() {
  console.log("Starting create match process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // Get input values
    const betAmount = Number(
      parseEther(document.getElementById("betLevelSelect").value)
    );
    const move = String(document.getElementById("createMoveSelect").value);
    const salt = String(document.getElementById("createSalt").value);

    // Validate inputs
    if (!salt || salt.trim() === "") {
      document.getElementById("createMatchStatus").innerText =
        "Please enter a salt value";
      return;
    }

    // Create commitment hash
    const commitment = createCommitment(move, salt);
    console.log(`Created commitment hash: ${commitment}`);

    // Update UI
    const createBtn = document.getElementById("createMatchBtn");
    createBtn.innerHTML = "Creating Match...";
    document.getElementById("createMatchStatus").innerText =
      "Creating match...";

    // Send transaction to create match
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "createMatch",
      args: [betAmount, commitment],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // Wait for confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // Extract match ID from transaction logs
    let matchId = null;
    if (receipt.logs && receipt.logs.length > 0) {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
          try {
            const decodedLog = await publicClient.parseEventLogs({
              abi: abi,
              logs: [log],
            });

            if (
              decodedLog.length > 0 &&
              decodedLog[0].eventName === "MatchCreated"
            ) {
              matchId = decodedLog[0].args.matchId;
              break;
            }
          } catch (e) {
            if (log.topics && log.topics.length > 1) {
              matchId = parseInt(log.topics[1], 16);
              break;
            }
          }
        }
      }
    }

    // Update UI and balance
    updateBalance();

    if (matchId !== null) {
      createBtn.innerHTML = `Match ID: ${matchId}`;
      document.getElementById(
        "createMatchStatus"
      ).innerText = `Match created successfully! Match ID: ${matchId} - Share this ID with your opponent!`;
    } else {
      createBtn.innerHTML = "Create";
      document.getElementById(
        "createMatchStatus"
      ).innerText = `Match created successfully! Transaction: ${txHash}`;
    }

    // Clear inputs
    document.getElementById("createSalt").value = "";
    return txHash;
  } catch (error) {
    console.error("An error occurred during match creation:", error);
    document.getElementById("createMatchBtn").innerHTML = "Create";
    document.getElementById("createMatchStatus").innerText = `Error: ${
      error.message || "Failed to create match"
    }`;
    throw error;
  }
}

// ===================================================================================
//                                  JOIN MATCH
// ===================================================================================

/**
 * Join existing Rock Paper Scissors match
 */
async function joinMatch() {
  console.log("Starting join match process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // Get input values
    const matchId = document.getElementById("joinMatchId").value;
    const move = String(document.getElementById("joinMoveSelect").value);
    const salt = String(document.getElementById("joinSalt").value);

    // Validate inputs
    if (!matchId || isNaN(matchId) || parseInt(matchId) < 0) {
      document.getElementById("joinMatchStatus").innerText =
        "Please enter a valid match ID";
      return;
    }

    if (!salt || salt.trim() === "") {
      document.getElementById("joinMatchStatus").innerText =
        "Please enter a salt value";
      return;
    }

    // Create commitment hash
    const commitment = createCommitment(move, salt);
    console.log(`Created commitment hash: ${commitment}`);

    // Update UI
    const joinBtn = document.getElementById("joinMatchBtn");
    joinBtn.innerHTML = "Joining Match...";
    document.getElementById("joinMatchStatus").innerText = "Joining match...";

    // Send transaction to join match
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "joinMatch",
      args: [parseInt(matchId), commitment],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // Wait for confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // Update UI and balance
    updateBalance();
    joinBtn.innerHTML = "Join";
    document.getElementById(
      "joinMatchStatus"
    ).innerText = `Joined match successfully! Transaction: ${txHash}`;

    // Clear inputs
    document.getElementById("joinMatchId").value = "";
    document.getElementById("joinSalt").value = "";
    return txHash;
  } catch (error) {
    console.error("An error occurred during join match:", error);
    document.getElementById("joinMatchBtn").innerHTML = "Join";
    document.getElementById("joinMatchStatus").innerText = `Error: ${
      error.message || "Failed to join match"
    }`;
    throw error;
  }
}

// ===================================================================================
//                                  REVEAL MOVE
// ===================================================================================

/**
 * Reveal player's move in Rock Paper Scissors match
 */
async function revealMove() {
  console.log("Starting reveal move process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // Get input values
    const matchId = document.getElementById("revealMatchId").value;
    const move = String(document.getElementById("revealMoveInput").value);
    const salt = String(document.getElementById("revealSaltInput").value);

    // Validate inputs
    if (!matchId || isNaN(matchId) || parseInt(matchId) < 0) {
      document.getElementById("revealStatus").innerText =
        "Please enter a valid match ID";
      return;
    }

    if (!move || !["rock", "paper", "scissors"].includes(move.toLowerCase())) {
      document.getElementById("revealStatus").innerText =
        "Please enter a valid move (rock/paper/scissors)";
      return;
    }

    if (!salt || salt.trim() === "") {
      document.getElementById("revealStatus").innerText =
        "Please enter your salt value";
      return;
    }

    // Update UI
    const revealBtn = document.getElementById("revealBtn");
    revealBtn.innerHTML = "Revealing...";
    document.getElementById("revealStatus").innerText = "Revealing move...";

    // Send transaction to reveal move
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "revealMove",
      args: [parseInt(matchId), move, salt],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // Wait for confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // Update UI
    revealBtn.innerHTML = "Reveal";
    document.getElementById(
      "revealStatus"
    ).innerText = `Move revealed successfully! Transaction: ${txHash}`;

    // Clear inputs
    document.getElementById("revealMatchId").value = "";
    document.getElementById("revealMoveInput").value = "";
    document.getElementById("revealSaltInput").value = "";
    return txHash;
  } catch (error) {
    console.error("An error occurred during move reveal:", error);
    document.getElementById("revealBtn").innerHTML = "Reveal";
    document.getElementById("revealStatus").innerText = `Error: ${
      error.message || "Failed to reveal move"
    }`;
    throw error;
  }
}

// ===================================================================================
//                                  MATCH STATUS
// ===================================================================================

/**
 * Get and display current status of a match
 */
async function getMatchStatus() {
  console.log("Getting match status...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // Get match ID
    const matchId = document.getElementById("resolveMatchId").value;

    // Validate input
    if (!matchId || isNaN(matchId) || parseInt(matchId) < 0) {
      document.getElementById("matchStatus").innerText =
        "Please enter a valid match ID";
      return;
    }

    // Update UI
    const statusBtn = document.getElementById("getMatchStatusBtn");
    statusBtn.innerHTML = "Getting Status...";

    // Read match data from contract
    const winner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "matchIdToWinner",
      args: [parseInt(matchId)],
    });

    console.log("Winner:", winner);
    statusBtn.innerHTML = winner;
  } catch (error) {
    console.error("An error occurred while getting match status:", error);
    document.getElementById("getMatchStatusBtn").innerHTML = "Get Status";
    document.getElementById("matchStatus").innerText = `Error: ${
      error.message || "Failed to get match status"
    }`;
    throw error;
  }
}

// ===================================================================================
//                                  EVENT LISTENERS
// ===================================================================================

// Wallet connection
document
  .getElementById("connectWalletBtn")
  .addEventListener("click", connectWallet);

// Deposit and withdraw
const depositBtn = document.getElementById("depositBtn");
depositBtn.onclick = deposit;

const withdrawBtn = document.getElementById("withdrawBtn");
withdrawBtn.onclick = withdraw;

// Game functionality
const createMatchBtn = document.getElementById("createMatchBtn");
createMatchBtn.onclick = createMatch;

const joinMatchBtn = document.getElementById("joinMatchBtn");
joinMatchBtn.onclick = joinMatch;

const revealBtn = document.getElementById("revealBtn");
revealBtn.onclick = revealMove;

const getMatchStatusBtn = document.getElementById("getMatchStatusBtn");
getMatchStatusBtn.onclick = getMatchStatus;

// ===================================================================================
//                                  INITIALIZATION
// ===================================================================================

// Initialize application
init();
