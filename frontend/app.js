// /**
//  * @file This script handles the client-side logic for interacting with a smart contract.
//  * It includes functionalities for connecting a user's wallet (like MetaMask),
//  * depositing and withdrawing USDC tokens using both standard transactions and the EIP-2612 permit standard.
//  * @author [Your Name/Team]
//  * @version 1.0.0
//  */

// // ===================================================================================
// //                                  IMPORTS
// // ===================================================================================

// import {
//   createWalletClient,
//   custom,
//   publicActions,
//   parseEther,
//   parseSignature,
//   createPublicClient,
//   http,
// } from "https://esm.sh/viem";
// import { sepolia } from "https://esm.sh/viem/chains";
// import {
//   CONTRACT_ADDRESS,
//   USDC_ADDRESS,
//   abi,
//   usdcAbi,
// } from "./constants-js.js";

// // ===================================================================================
// //                                  STATE
// // ===================================================================================

// /**
//  * @dev The viem wallet client instance for sending transactions and signing messages.
//  * @type {import('viem').WalletClient | undefined}
//  */
// let walletClient;

// /**
//  * @dev The Ethereum address of the currently connected user.
//  * @type {string | undefined}
//  */
// let connectedAccount;

// // ===================================================================================
// //                                  INITIALIZATION
// // ===================================================================================

// /**
//  * @dev Initializes the application by setting up the wallet client and checking
//  * for a pre-existing connection with MetaMask.
//  */
// function init() {
//   // Check if the browser has an Ethereum provider (like MetaMask) injected.
//   if (!window.ethereum) {
//     alert("MetaMask is not installed!");
//     return;
//   }

//   // Create a wallet client to interact with the user's wallet.
//   walletClient = createWalletClient({
//     transport: custom(window.ethereum),
//   });

//   // Silently check if the user has already connected their wallet to this site before.
//   // This provides a better UX by not forcing a connection prompt on every page load.
//   window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
//     if (accounts.length > 0) {
//       connectedAccount = accounts[0];
//       updateUI(); // Update the UI to reflect the connected state.
//     } else {
//       // If not connected, ensure the UI shows the default "Connect Wallet" state.
//       document.getElementById("connectWalletBtn").innerText = "Connect Wallet";
//     }
//   });
// }

// // ===================================================================================
// //                                  UI UPDATES
// // ===================================================================================

// /**
//  * @dev Updates the user interface to reflect the current connected account state.
//  * This includes showing the connected address and fetching the user's balance.
//  */
// function updateUI() {
//   document.getElementById("connectWalletBtn").innerText =
//     shortenAddress(connectedAccount);
//   updateBalance();
// }

// /**
//  * @dev Takes a full Ethereum address and returns a shortened version (e.g., "0x123...abcd").
//  * @param {string} address - The full Ethereum address.
//  * @returns {string} The shortened address.
//  */
// function shortenAddress(address) {
//   return `${address.slice(0, 6)}...${address.slice(-4)}`;
// }

// // ===================================================================================
// //                                  BLOCKCHAIN FUNCTIONS
// // ===================================================================================

// /**
//  * @dev Prompts the user to connect their wallet via MetaMask and updates the UI upon success.
//  */
// async function connectWallet() {
//   if (!walletClient) return alert("Wallet not initialized");

//   // This will open the MetaMask prompt for the user to select an account.
//   const accounts = await walletClient.requestAddresses();
//   connectedAccount = accounts[0];
//   updateUI();
// }

// /**
//  * @dev Reads the user's USDC balance from our custom smart contract.
//  * @param {string} address - The address of the user to check the balance for.
//  * @returns {Promise<bigint>} The user's balance as a BigInt.
//  */
// async function getPlayerBalance(address) {
//   const publicClient = createPublicClient({
//     chain: sepolia,
//     transport: custom(window.ethereum),
//   });

//   // Perform a read-only call to the smart contract.
//   return await publicClient.readContract({
//     address: CONTRACT_ADDRESS,
//     abi,
//     functionName: "getPlayerBalance",
//     args: [address],
//   });
// }

// /**
//  * @dev Fetches the connected user's balance from the contract and updates the DOM.
//  */
// async function updateBalance() {
//   if (!connectedAccount) return;
//   const rawBalance = await getPlayerBalance(connectedAccount);
//   document.getElementById("balance").innerText = `Balance: ${rawBalance} USDC`;
// }

// /**
//  * @dev Handles the entire deposit flow using the EIP-2612 permit standard.
//  * This allows for a gasless approval by signing a message, followed by the deposit transaction.
//  * @returns {Promise<string>} The transaction hash of the deposit.
//  */

// /*//////////////////////////////////////////////////////////////
//                                 DEPOSIT
//     //////////////////////////////////////////////////////////////*/
// async function deposit() {
//   console.log("Starting deposit process...");

//   try {
//     const publicClient = createPublicClient({
//       chain: sepolia,
//       transport: custom(window.ethereum),
//     });

//     // --- Step 1: Get user account ---
//     const [userAddress] = await walletClient.getAddresses();
//     if (!userAddress) {
//       throw new Error("Could not get user address. Is your wallet connected?");
//     }
//     console.log(`User address: ${userAddress}`);

//     let depositAmount = document.getElementById("usdcAmount").value;
//     console.log(`Deposit amount in wei: ${depositAmount}`);

//     // --- Step 2: Fetch the current nonce for the EIP-2612 permit ---
//     // The nonce is crucial to prevent replay attacks on the signature.
//     const nonce = await publicClient.readContract({
//       address: USDC_ADDRESS,
//       abi: usdcAbi,
//       functionName: "nonces",
//       args: [userAddress],
//     });
//     console.log(`USDC nonce for user: ${nonce}`);

//     // --- Step 3: Set a deadline for the permit ---
//     // The signature will be invalid after this timestamp.
//     const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 minutes from now
//     console.log(`Permit deadline (timestamp): ${deadline}`);

//     // --- Step 4: Define the EIP-712 typed data for the permit signature ---
//     // This structured data is what the user will sign. It's human-readable in compatible wallets.
//     const domain = {
//       name: "USD Coin", // Name of the ERC-20 token
//       version: "1", // The version of the permit implementation
//       chainId: sepolia.id,
//       verifyingContract: USDC_ADDRESS,
//     };

//     const types = {
//       Permit: [
//         { name: "owner", type: "address" },
//         { name: "spender", type: "address" },
//         { name: "value", type: "uint256" },
//         { name: "nonce", type: "uint256" },
//         { name: "deadline", type: "uint256" },
//       ],
//     };

//     const message = {
//       owner: userAddress,
//       spender: CONTRACT_ADDRESS, // The contract we are giving permission to
//       value: depositAmount,
//       nonce: nonce,
//       deadline: deadline,
//     };

//     // --- Step 5: Request the user to sign the typed data ---
//     console.log("Requesting signature from user...");
//     const signatureHex = await walletClient.signTypedData({
//       account: userAddress,
//       domain,
//       types,
//       primaryType: "Permit",
//       message,
//     });
//     console.log("Signature received.");

//     // --- Step 6: Split the signature into v, r, s components ---
//     // These are the raw components required by the smart contract's `depositWithPermit` function.
//     const { v, r, s } = parseSignature(signatureHex);

//     // --- Step 7: Send the transaction to the smart contract ---
//     depositBtn.innerHTML = "Sending transaction...";
//     console.log("Sending transaction to depositWithPermit...");
//     const { request } = await publicClient.simulateContract({
//       account: userAddress,
//       address: CONTRACT_ADDRESS,
//       abi: abi,
//       functionName: "depositWithPermit",
//       args: [depositAmount, deadline, v, r, s],
//       chain: sepolia,
//     });

//     const txHash = await walletClient.writeContract(request);
//     console.log(`Transaction sent! Hash: ${txHash}`);

//     // --- Step 8: Wait for the transaction to be confirmed on the blockchain ---
//     console.log("Waiting for transaction confirmation...");
//     const receipt = await publicClient.waitForTransactionReceipt({
//       hash: txHash,
//     });
//     console.log("Transaction confirmed!", receipt);
//     updateBalance();

//     depositBtn.innerHTML = "Deposit";

//     return txHash;
//   } catch (error) {
//     console.error("An error occurred during the deposit process:", error);
//     throw error; // Propagate the error for potential UI handling
//   }
// }

// /**
//  * @dev Handles the withdrawal of USDC from the smart contract to the user's wallet.
//  * @returns {Promise<string>} The transaction hash of the withdrawal.
//  */

// /*//////////////////////////////////////////////////////////////
//                                 WITHDRAW
//     //////////////////////////////////////////////////////////////*/
// async function withdraw() {
//   console.log("Starting withdraw process...");

//   try {
//     const publicClient = createPublicClient({
//       chain: sepolia,
//       transport: custom(window.ethereum),
//     });

//     // --- Step 1: Get user account ---
//     const [userAddress] = await walletClient.getAddresses();
//     if (!userAddress) {
//       throw new Error("Could not get user address. Is your wallet connected?");
//     }
//     console.log(`User address: ${userAddress}`);

//     // --- Step 2: Get and validate the amount from the input field ---
//     const amountToWithdraw = document.getElementById("usdcAmount").value;
//     if (!amountToWithdraw || parseFloat(amountToWithdraw) <= 0) {
//       withdrawBtn.innerHTML = "Please enter a valid amount to withdraw.";
//       return;
//     }

//     withdrawBtn.innerHTML = "Sending transaction...";

//     // --- Step 3: Call the smart contract's withdraw function ---
//     const { request } = await publicClient.simulateContract({
//       account: userAddress,
//       address: CONTRACT_ADDRESS,
//       abi: abi,
//       functionName: "withdraw",
//       args: [amountToWithdraw],
//       chain: sepolia,
//     });

//     const txHash = await walletClient.writeContract(request);
//     console.log(`Transaction sent! Hash: ${txHash}`);

//     // --- Step 4: Wait for the transaction to be confirmed ---
//     console.log("Waiting for transaction confirmation...");
//     const receipt = await publicClient.waitForTransactionReceipt({
//       hash: txHash,
//     });
//     console.log("Transaction confirmed!", receipt);
//     updateBalance(); // Refresh the balance in the UI

//     withdrawBtn.innerHTML = "Withdraw";

//     return txHash;
//   } catch (error) {
//     console.error("An error occurred during the withdraw process:", error);
//     throw error; // Propagate the error
//   }
// }

// // ===================================================================================
// //                                  EVENT LISTENERS
// // ===================================================================================

// // Attach the connectWallet function to the connect button's click event.
// document
//   .getElementById("connectWalletBtn")
//   .addEventListener("click", connectWallet);

// // Get button elements from the DOM.
// const depositBtn = document.getElementById("depositBtn");
// depositBtn.onclick = deposit;

// const withdrawBtn = document.getElementById("withdrawBtn");
// withdrawBtn.onclick = withdraw;

// // --- SCRIPT EXECUTION ---

// // Initialize the application when the script loads.
// init();
/**
 * @file This script handles the client-side logic for interacting with a smart contract.
 * It includes functionalities for connecting a user's wallet (like MetaMask),
 * depositing and withdrawing USDC tokens using both standard transactions and the EIP-2612 permit standard.
 * @author [Your Name/Team]
 * @version 1.0.0
 */

// ===================================================================================
//                                  IMPORTS
// ===================================================================================

// Use more reliable CDN for viem
import {
  createWalletClient,
  custom,
  parseSignature,
  createPublicClient,
  formatEther,
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
//                                  STATE
// ===================================================================================

/**
 * @dev The viem wallet client instance for sending transactions and signing messages.
 * @type {import('viem').WalletClient | undefined}
 */
let walletClient;

/**
 * @dev The Ethereum address of the currently connected user.
 * @type {string | undefined}
 */
let connectedAccount;

const ethToWei = 10 * (10 ^ 18);

// ===================================================================================
//                                  INITIALIZATION
// ===================================================================================

/**
 * @dev Initializes the application by setting up the wallet client and checking
 * for a pre-existing connection with MetaMask.
 */
function init() {
  // Check if the browser has an Ethereum provider (like MetaMask) injected.
  if (!window.ethereum) {
    alert("MetaMask is not installed!");
    return;
  }

  // Create a wallet client to interact with the user's wallet.
  walletClient = createWalletClient({
    transport: custom(window.ethereum),
  });

  // Silently check if the user has already connected their wallet to this site before.
  // This provides a better UX by not forcing a connection prompt on every page load.
  window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
    if (accounts.length > 0) {
      connectedAccount = accounts[0];
      updateUI(); // Update the UI to reflect the connected state.
    } else {
      // If not connected, ensure the UI shows the default "Connect Wallet" state.
      document.getElementById("connectWalletBtn").innerText = "Connect Wallet";
    }
  });
}

// ===================================================================================
//                                  UI UPDATES
// ===================================================================================

/**
 * @dev Updates the user interface to reflect the current connected account state.
 * This includes showing the connected address and fetching the user's balance.
 */
function updateUI() {
  document.getElementById("connectWalletBtn").innerText =
    shortenAddress(connectedAccount);
  updateBalance();
}

/**
 * @dev Takes a full Ethereum address and returns a shortened version (e.g., "0x123...abcd").
 * @param {string} address - The full Ethereum address.
 * @returns {string} The shortened address.
 */
function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ===================================================================================
//                                  UTILITY FUNCTIONS
// ===================================================================================

/**
 * @dev Converts move string to number for smart contract interaction
 * @param {string} move - The move as a string ("rock", "paper", "scissors")
 * @returns {number} The move as a number (0, 1, 2)
 */
function moveToNumber(move) {
  const moves = { rock: 0, paper: 1, scissors: 2 };
  return moves[move.toLowerCase()];
}

/**
 * @dev Converts move number to string for display
 * @param {number} move - The move as a number (0, 1, 2)
 * @returns {string} The move as a string
 */
function numberToMove(move) {
  const moves = ["Rock", "Paper", "Scissors"];
  return moves[move] || "Unknown";
}

/**
 * @dev Creates a commitment hash for the move using keccak256
 * @param {string} move - The move as a string
 * @param {string} salt - The salt string
 * @returns {string} The keccak256 hash of the move and salt
 */
function createCommitment(move, salt) {
  const moveNum = moveToNumber(move);
  return keccak256(encodePacked(["uint8", "string"], [moveNum, salt]));
}

// ===================================================================================
//                                  BLOCKCHAIN FUNCTIONS
// ===================================================================================

/**
 * @dev Prompts the user to connect their wallet via MetaMask and updates the UI upon success.
 */
async function connectWallet() {
  if (!walletClient) return alert("Wallet not initialized");

  // This will open the MetaMask prompt for the user to select an account.
  const accounts = await walletClient.requestAddresses();
  connectedAccount = accounts[0];
  updateUI();
}

/**
 * @dev Reads the user's USDC balance from our custom smart contract.
 * @param {string} address - The address of the user to check the balance for.
 * @returns {Promise<bigint>} The user's balance as a BigInt.
 */
async function getPlayerBalance(address) {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom(window.ethereum),
  });

  // Perform a read-only call to the smart contract.
  return await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi,
    functionName: "getPlayerBalance",
    args: [address],
  });
}

/**
 * @dev Fetches the connected user's balance from the contract and updates the DOM.
 */
async function updateBalance() {
  if (!connectedAccount) return;
  const rawBalance = await getPlayerBalance(connectedAccount);
  document.getElementById("balance").innerText = `Balance: ${formatEther(
    rawBalance
  )} USDC`;
}

/**
 * @dev Handles the entire deposit flow using the EIP-2612 permit standard.
 * This allows for a gasless approval by signing a message, followed by the deposit transaction.
 * @returns {Promise<string>} The transaction hash of the deposit.
 */

/*//////////////////////////////////////////////////////////////
                                DEPOSIT
    //////////////////////////////////////////////////////////////*/
async function deposit() {
  console.log("Starting deposit process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    let depositAmount = document.getElementById("usdcAmount").value;
    depositAmount = depositAmount * ethToWei;
    console.log(`Deposit amount in wei: ${depositAmount}`);

    // --- Step 2: Fetch the current nonce for the EIP-2612 permit ---
    // The nonce is crucial to prevent replay attacks on the signature.
    const nonce = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: "nonces",
      args: [userAddress],
    });
    console.log(`USDC nonce for user: ${nonce}`);

    // --- Step 3: Set a deadline for the permit ---
    // The signature will be invalid after this timestamp.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 minutes from now
    console.log(`Permit deadline (timestamp): ${deadline}`);

    // --- Step 4: Define the EIP-712 typed data for the permit signature ---
    // This structured data is what the user will sign. It's human-readable in compatible wallets.
    const domain = {
      name: "USD Coin", // Name of the ERC-20 token
      version: "1", // The version of the permit implementation
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
      spender: CONTRACT_ADDRESS, // The contract we are giving permission to
      value: depositAmount,
      nonce: nonce,
      deadline: deadline,
    };

    // --- Step 5: Request the user to sign the typed data ---
    console.log("Requesting signature from user...");
    const signatureHex = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });
    console.log("Signature received.");

    // --- Step 6: Split the signature into v, r, s components ---
    // These are the raw components required by the smart contract's `depositWithPermit` function.
    const { v, r, s } = parseSignature(signatureHex);

    // --- Step 7: Send the transaction to the smart contract ---
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

    // --- Step 8: Wait for the transaction to be confirmed on the blockchain ---
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
    throw error; // Propagate the error for potential UI handling
  }
}

/**
 * @dev Handles the withdrawal of USDC from the smart contract to the user's wallet.
 * @returns {Promise<string>} The transaction hash of the withdrawal.
 */

/*//////////////////////////////////////////////////////////////
                                WITHDRAW
    //////////////////////////////////////////////////////////////*/
async function withdraw() {
  console.log("Starting withdraw process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // --- Step 2: Get and validate the amount from the input field ---
    const amountToWithdraw = document.getElementById("usdcAmount").value;
    if (!amountToWithdraw || parseFloat(amountToWithdraw) <= 0) {
      withdrawBtn.innerHTML = "Please enter a valid amount to withdraw.";
      return;
    }

    withdrawBtn.innerHTML = "Sending transaction...";

    // --- Step 3: Call the smart contract's withdraw function ---
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

    // --- Step 4: Wait for the transaction to be confirmed ---
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);
    updateBalance(); // Refresh the balance in the UI

    withdrawBtn.innerHTML = "Withdraw";

    return txHash;
  } catch (error) {
    console.error("An error occurred during the withdraw process:", error);
    throw error; // Propagate the error
  }
}

/*//////////////////////////////////////////////////////////////
                            CREATE MATCH
    //////////////////////////////////////////////////////////////*/

/**
 * @dev Creates a new Rock Paper Scissors match with a commitment hash
 * @returns {Promise<string>} The transaction hash of the match creation
 */
async function createMatch() {
  console.log("Starting create match process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // --- Step 2: Get input values ---
    const betAmount = document.getElementById("betLevelSelect").value;
    const move = document.getElementById("createMoveSelect").value;
    const salt = document.getElementById("createSalt").value;

    // --- Step 3: Validate inputs ---
    if (!salt || salt.trim() === "") {
      document.getElementById("createMatchStatus").innerText =
        "Please enter a salt value";
      return;
    }

    // --- Step 4: Create commitment hash ---
    const commitment = createCommitment(move, salt);
    console.log(`Created commitment hash: ${commitment}`);

    // --- Step 5: Update UI ---
    const createBtn = document.getElementById("createMatchBtn");
    createBtn.innerHTML = "Creating Match...";
    document.getElementById("createMatchStatus").innerText =
      "Creating match...";

    // --- Step 6: Send transaction to create match ---
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

    // --- Step 7: Wait for confirmation ---
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // --- Step 8: Extract match ID from transaction logs ---
    let matchId = null;
    if (receipt.logs && receipt.logs.length > 0) {
      // Look for MatchCreated event in the logs
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
          try {
            // Decode the log to get the match ID
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
            // If we can't decode, try to extract from topics
            if (log.topics && log.topics.length > 1) {
              matchId = parseInt(log.topics[1], 16);
              break;
            }
          }
        }
      }
    }

    // --- Step 9: Update UI and balance ---
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

/*//////////////////////////////////////////////////////////////
                            JOIN MATCH
    //////////////////////////////////////////////////////////////*/

/**
 * @dev Joins an existing Rock Paper Scissors match
 * @returns {Promise<string>} The transaction hash of joining the match
 */
async function joinMatch() {
  console.log("Starting join match process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // --- Step 2: Get input values ---
    const matchId = document.getElementById("joinMatchId").value;
    const move = document.getElementById("joinMoveSelect").value;
    const salt = document.getElementById("joinSalt").value;

    // --- Step 3: Validate inputs ---
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

    // --- Step 4: Create commitment hash ---
    const commitment = createCommitment(move, salt);
    console.log(`Created commitment hash: ${commitment}`);

    // --- Step 5: Update UI ---
    const joinBtn = document.getElementById("joinMatchBtn");
    joinBtn.innerHTML = "Joining Match...";
    document.getElementById("joinMatchStatus").innerText = "Joining match...";

    // --- Step 6: Send transaction to join match ---
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

    // --- Step 7: Wait for confirmation ---
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // --- Step 8: Update UI and balance ---
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

/*//////////////////////////////////////////////////////////////
                            REVEAL MOVE
    //////////////////////////////////////////////////////////////*/

/**
 * @dev Reveals the player's move in a Rock Paper Scissors match
 * @returns {Promise<string>} The transaction hash of the reveal transaction
 */
async function revealMove() {
  console.log("Starting reveal move process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // --- Step 2: Get input values ---
    const matchId = document.getElementById("revealMatchId").value;
    const move = document.getElementById("revealMoveInput").value;
    const salt = document.getElementById("revealSaltInput").value;

    // --- Step 3: Validate inputs ---
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

    // --- Step 4: Convert move to number ---
    const moveNumber = moveToNumber(move);

    // --- Step 5: Update UI ---
    const revealBtn = document.getElementById("revealBtn");
    revealBtn.innerHTML = "Revealing...";
    document.getElementById("revealStatus").innerText = "Revealing move...";

    // --- Step 6: Send transaction to reveal move ---
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "revealMove",
      args: [parseInt(matchId), moveNumber, salt],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // --- Step 7: Wait for confirmation ---
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // --- Step 8: Update UI ---
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

/*//////////////////////////////////////////////////////////////
                            GET MATCH STATUS
    //////////////////////////////////////////////////////////////*/

/**
 * @dev Gets the current status of a match and displays it
 * @returns {Promise<void>}
 */
async function getMatchStatus() {
  console.log("Getting match status...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get match ID ---
    const matchId = document.getElementById("resolveMatchId").value;

    // --- Step 2: Validate input ---
    if (!matchId || isNaN(matchId) || parseInt(matchId) < 0) {
      document.getElementById("matchStatus").innerText =
        "Please enter a valid match ID";
      return;
    }

    // --- Step 3: Update UI ---
    const statusBtn = document.getElementById("getMatchStatusBtn");
    statusBtn.innerHTML = "Getting Status...";

    // --- Step 4: Read match data from contract ---
    const matchData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "getMatch",
      args: [parseInt(matchId)],
    });

    console.log("Match data:", matchData);

    // --- Step 5: Parse and display match information ---
    const [
      player1,
      player2,
      betAmount,
      player1Commitment,
      player2Commitment,
      player1Move,
      player2Move,
      winner,
      isResolved,
    ] = matchData;

    let statusText = `Match ID: ${matchId}\n`;
    statusText += `Player 1: ${player1}\n`;
    statusText += `Player 2: ${
      player2 !== "0x0000000000000000000000000000000000000000"
        ? player2
        : "Waiting for player..."
    }\n`;
    statusText += `Bet Amount: ${betAmount} USDC\n`;
    statusText += `Player 1 Move: ${
      player1Move !== 255 ? numberToMove(player1Move) : "Not revealed"
    }\n`;
    statusText += `Player 2 Move: ${
      player2Move !== 255 ? numberToMove(player2Move) : "Not revealed"
    }\n`;
    statusText += `Winner: ${
      winner !== "0x0000000000000000000000000000000000000000" ? winner : "TBD"
    }\n`;
    statusText += `Status: ${isResolved ? "Resolved" : "In Progress"}`;

    document.getElementById("matchStatus").innerText = statusText;
    statusBtn.innerHTML = "Get Status";
  } catch (error) {
    console.error("An error occurred while getting match status:", error);
    document.getElementById("getMatchStatusBtn").innerHTML = "Get Status";
    document.getElementById("matchStatus").innerText = `Error: ${
      error.message || "Failed to get match status"
    }`;
    throw error;
  }
}

/*//////////////////////////////////////////////////////////////
                            RESOLVE MATCH
    //////////////////////////////////////////////////////////////*/

/**
 * @dev Resolves a match after both players have revealed their moves
 * @returns {Promise<string>} The transaction hash of the resolve transaction
 */
async function resolveMatch() {
  console.log("Starting resolve match process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    // --- Step 1: Get user account ---
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    // --- Step 2: Get match ID ---
    const matchId = document.getElementById("resolveMatchId").value;

    // --- Step 3: Validate input ---
    if (!matchId || isNaN(matchId) || parseInt(matchId) < 0) {
      document.getElementById("matchStatus").innerText =
        "Please enter a valid match ID";
      return;
    }

    // --- Step 4: Check if match can be resolved ---
    // First get match status to verify both moves are revealed
    const matchData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "getMatch",
      args: [parseInt(matchId)],
    });

    const [, , , , , player1Move, player2Move, , isResolved] = matchData;

    if (isResolved) {
      document.getElementById("matchStatus").innerText =
        "Match is already resolved!";
      return;
    }

    if (player1Move === 255 || player2Move === 255) {
      document.getElementById("matchStatus").innerText =
        "Both players must reveal their moves before resolving";
      return;
    }

    // --- Step 5: Send transaction to resolve match ---
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "resolveMatch",
      args: [parseInt(matchId)],
      chain: sepolia,
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // --- Step 6: Wait for confirmation ---
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    // --- Step 7: Update UI and get final match status ---
    updateBalance();
    await getMatchStatus(); // Refresh the match status display

    document.getElementById(
      "matchStatus"
    ).innerText += `\n\nMatch resolved! Transaction: ${txHash}`;

    return txHash;
  } catch (error) {
    console.error("An error occurred during match resolution:", error);
    document.getElementById("matchStatus").innerText = `Error: ${
      error.message || "Failed to resolve match"
    }`;
    throw error;
  }
}

// ===================================================================================
//                                  EVENT LISTENERS
// ===================================================================================

// Attach the connectWallet function to the connect button's click event.
document
  .getElementById("connectWalletBtn")
  .addEventListener("click", connectWallet);

// Get button elements from the DOM.
const depositBtn = document.getElementById("depositBtn");
depositBtn.onclick = deposit;

const withdrawBtn = document.getElementById("withdrawBtn");
withdrawBtn.onclick = withdraw;

// New event listeners for game functionality
const createMatchBtn = document.getElementById("createMatchBtn");
createMatchBtn.onclick = createMatch;

const joinMatchBtn = document.getElementById("joinMatchBtn");
joinMatchBtn.onclick = joinMatch;

const revealBtn = document.getElementById("revealBtn");
revealBtn.onclick = revealMove;

const getMatchStatusBtn = document.getElementById("getMatchStatusBtn");
getMatchStatusBtn.onclick = getMatchStatus;

// Add a resolve match button functionality (you may need to add this button to your HTML)
// If you want a separate resolve button, uncomment the lines below and add the button to HTML
/*
const resolveMatchBtn = document.getElementById("resolveMatchBtn");
if (resolveMatchBtn) {
  resolveMatchBtn.onclick = resolveMatch;
}
*/

// --- SCRIPT EXECUTION ---

// Initialize the application when the script loads.
init();
