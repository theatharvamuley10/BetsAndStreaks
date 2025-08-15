import {
  createWalletClient,
  custom,
  createPublicClient,
  formatEther,
} from "https://esm.sh/viem";

import { mainnet, sepolia } from "https://esm.sh/viem/chains";

let walletClient;
async function connect() {
  if (typeof window.ethereum != "undefined") {
    walletClient = await createWalletClient({
      transport: custom(window.ethereum),
    });

    const accounts = await walletClient.requestAddresses();
    const connectedAccount = accounts[0];
    connectWalletBtn.innerHTML = connectedAccount;

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    });
    const balance = await publicClient.getBalance({
      address: connectedAccount,
    });

    const balanceElement = document.getElementById("balance");
    balanceElement.innerHTML = "Balance: " + formatEther(balance);
  }
}

async function deposit() {
  if (walletClient != undefined) {
    const connectedAccount = getConnectedAccount();
  }
}

async function getBalance(connectedAccount) {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom(window.ethereum),
  });
  const balance = await publicClient.getBalance({
    address: connectedAccount,
  });
  return balance;
}

async function getConnectedAccount() {
  const accounts = await walletClient.requestAddresses();
  return accounts[0];
}

const connectWalletBtn = document.getElementById("connectWalletBtn");
const depositBtn = document.getElementById("depositBtn");
const withdrawBtn = document.getElementById("withdrawBtn");

connectWalletBtn.onclick = connect;
depositBtn.onclick = deposit;
