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

// -------------------- State --------------------
let walletClient;
let connectedAccount;

// -------------------- Initialization --------------------
function init() {
  if (!window.ethereum) {
    alert("MetaMask is not installed!");
    return;
  }

  walletClient = createWalletClient({
    transport: custom(window.ethereum),
  });

  // Optionally: Check if already connected (without requesting)
  window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
    if (accounts.length > 0) {
      connectedAccount = accounts[0];
      updateUI();
    } else {
      // Not connected yet, just show default UI
      document.getElementById("connectWalletBtn").innerText = "Connect Wallet";
    }
  });
}

// -------------------- UI Updates --------------------
function updateUI() {
  document.getElementById("connectWalletBtn").innerText =
    shortenAddress(connectedAccount);
  updateBalance();
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// -------------------- Blockchain Functions --------------------
async function connectWallet() {
  if (!walletClient) return alert("Wallet not initialized");

  const accounts = await walletClient.requestAddresses(); // Will only run on button click
  connectedAccount = accounts[0];
  updateUI();
}

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

async function updateBalance() {
  if (!connectedAccount) return;
  const rawBalance = await getPlayerBalance(connectedAccount);
  document.getElementById("balance").innerText = `Balance: ${rawBalance} USDC`;
}

export async function deposit() {
  console.log("Starting deposit process...");

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });
    // 1. Get user account
    const [userAddress] = await walletClient.getAddresses();
    if (!userAddress) {
      throw new Error("Could not get user address. Is your wallet connected?");
    }
    console.log(`User address: ${userAddress}`);

    let depositAmount = document.getElementById("usdcAmount").value;
    console.log(`Deposit amount in wei: ${depositAmount}`);

    // 2. Fetch the current nonce for the user from the USDC contract
    const nonce = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: "nonces",
      args: [userAddress],
    });
    console.log(`USDC nonce for user: ${nonce}`);

    // 3. Set a deadline for the permit (e.g., 30 minutes from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    console.log(`Permit deadline (timestamp): ${deadline}`);

    // 4. Define the EIP-712 typed data for the permit signature
    const domain = {
      name: "USD Coin", // You might want to fetch this dynamically
      version: "2", // Verify the version for your USDC contract
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

    // 5. Request the user to sign the typed data
    console.log("Requesting signature from user...");
    const signatureHex = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: "Permit",
      message,
    });
    console.log("Signature received.");

    // 6. Split the signature into v, r, s components
    const { v, r, s } = parseSignature(signatureHex);

    // 7. Send the transaction to your smart contract
    console.log("Sending transaction to depositWithPermit...");
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: CONTRACT_ADDRESS,
      abi: abi,
      functionName: "depositWithPermit",
      args: [depositAmount, deadline, v, r, s],
    });

    const txHash = await walletClient.writeContract(request);
    console.log(`Transaction sent! Hash: ${txHash}`);

    // 8. Wait for the transaction to be confirmed
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log("Transaction confirmed!", receipt);

    return txHash;
  } catch (error) {
    console.error("An error occurred during the deposit process:", error);
    // Re-throw the error so the UI can handle it
    throw error;
  }
}

// -------------------- Event Listeners --------------------
document
  .getElementById("connectWalletBtn")
  .addEventListener("click", connectWallet);

// Initialize without forcing connection popup
init();

const depositBtn = document.getElementById("depositBtn");
depositBtn.onclick = deposit;
