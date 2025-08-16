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

import {
  createWalletClient,
  custom,
  publicActions,
  parseEther,
  parseSignature,
  createPublicClient,
  http,
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
  document.getElementById("balance").innerText = `Balance: ${rawBalance} USDC`;
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

// --- SCRIPT EXECUTION ---

// Initialize the application when the script loads.
init();
