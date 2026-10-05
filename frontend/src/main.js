import { BrowserProvider, Contract, formatEther, getAddress } from "ethers";
import { MINIMUM_USD, formatUsd, minimumWei, parseEthInput, usdValue } from "./amounts.js";
import "./style.css";

/** @typedef {{contractAddress: string, chainId: number, networkName: string, owner: string, priceFeed: string, maxPriceAge: string, minimumUsd: string, explorerUrl: string | null, abi: import('ethers').InterfaceAbi}} Deployment */
/** @type {Deployment | null} */
let config = null;
/** @type {BrowserProvider | null} */
let provider = null;
/** @type {Contract | null} */
let contract = null;
let account = "";
let owner = "";
let balance = 0n;
let price = 0n;
let busy = false;
let validNetwork = false;

/** @param {string} id */
function element(id) {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value;
}
/** @param {string} id */
function button(id) { return /** @type {HTMLButtonElement} */ (element(id)); }
const amount = /** @type {HTMLInputElement} */ (element("amount"));

/** @param {string} message @param {string} [kind] */
function status(message, kind = "info") {
  element("status").textContent = message;
  element("status").dataset.kind = kind;
}

function controls() {
  const ready = !!contract && validNetwork;
  const isOwner = ready && account.toLowerCase() === owner.toLowerCase();
  button("connect").disabled = busy || !config;
  button("refresh").disabled = busy || !ready;
  button("fund").disabled = busy || !ready || price <= 0n;
  button("withdraw").disabled = busy || !isOwner || balance === 0n;
  button("switch-network").disabled = busy;
  element("owner-panel").hidden = !isOwner;
  amount.disabled = busy;
}

function updateEstimate() {
  if (!price) return;
  try {
    const value = parseEthInput(amount.value);
    const usd = usdValue(value, price);
    element("estimate").textContent = `${formatUsd(usd)} at the current price. ${usd < MINIMUM_USD ? "Below the $2 minimum." : "Meets the current minimum."}`;
  } catch {
    element("estimate").textContent = `Current minimum: ${formatEther(minimumWei(price))} ETH. The price can change before mining.`;
  }
}

/** @param {unknown} error */
function errorMessage(error) {
  const e = /** @type {{code?: string | number, shortMessage?: string, message?: string, revert?: {name?: string}, data?: string}} */ (error);
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return "The request was rejected in your wallet.";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Your wallet needs enough ETH for the contribution and gas.";
  let name = e?.revert?.name;
  if (!name && contract && typeof e?.data === "string") {
    try { name = contract.interface.parseError(e.data)?.name; } catch { /* Fall back to the wallet error. */ }
  }
  /** @type {Record<string, string>} */
  const messages = {
    FundMe__MinimumContributionNotMet: "The on-chain value is below $2. Refresh the price and increase your amount.",
    FundMe__InvalidPrice: "The oracle returned an invalid price. Funding is unavailable.",
    FundMe__InvalidRoundData: "The oracle returned invalid round data. Funding is unavailable.",
    FundMe__StalePrice: "The oracle price is stale. Wait for a fresh update before funding.",
    FundMe__NotOwner: "Only the contract owner can withdraw.",
    FundMe__NothingToWithdraw: "The contract has no ETH to withdraw.",
    FundMe__TransferFailed: "The owner could not receive ETH. The withdrawal was reverted.",
  };
  return (name && messages[name]) || e?.shortMessage || e?.message || "The wallet request failed.";
}

async function checkNetwork() {
  if (!provider || !config) throw new Error("Connect your wallet first.");
  const chainId = Number(BigInt(await provider.send("eth_chainId", [])));
  validNetwork = chainId === config.chainId;
  element("switch-network").hidden = validNetwork;
  controls();
  if (!validNetwork) throw new Error(`Switch MetaMask to ${config.networkName} (chain ${config.chainId}).`);
}

async function refresh() {
  if (!contract || !provider || !config) throw new Error("Connect your wallet first.");
  await checkNetwork();
  const [actualOwner, currentBalance, actualFeed, minimum] = await Promise.all([
    contract.i_owner(), provider.getBalance(config.contractAddress, "latest"), contract.getPriceFeed(), contract.MINIMUM_USD(),
  ]);
  if (minimum !== MINIMUM_USD || getAddress(actualFeed) !== getAddress(config.priceFeed)
      || getAddress(actualOwner) !== getAddress(config.owner)) {
    contract = null;
    controls();
    throw new Error("This deployment does not match the frontend configuration. Export it again.");
  }
  owner = actualOwner;
  balance = currentBalance;
  element("balance").textContent = `${formatEther(balance)} ETH`;
  element("owner-balance").textContent = `${formatEther(balance)} ETH`;
  try {
    price = await contract.getPrice();
    element("price").textContent = formatUsd(price);
    element("oracle-status").textContent = `Current minimum: ${formatEther(minimumWei(price))} ETH. Refreshed ${new Date().toLocaleTimeString()}.`;
    updateEstimate();
  } catch (error) {
    price = 0n;
    element("price").textContent = "Unavailable";
    element("oracle-status").textContent = errorMessage(error);
    element("estimate").textContent = "Funding requires a fresh, valid oracle price.";
    // Oracle failure must not hide the owner's independent withdrawal controls.
  }
  controls();
}

async function connect() {
  if (!window.ethereum) throw new Error("Install MetaMask and open this page in its browser context.");
  if (!config) throw new Error("Deploy FundMe and generate the frontend configuration first.");
  provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await checkNetwork();
  const signer = await provider.getSigner();
  account = await signer.getAddress();
  element("wallet").textContent = account;
  if (await provider.getCode(config.contractAddress) === "0x") {
    throw new Error("No contract exists at the configured address. If the local node restarted, deploy again.");
  }
  contract = new Contract(config.contractAddress, config.abi, signer);
  await refresh();
  status("Wallet connected. Review the amount before confirming a contribution.");
}

/** @param {() => Promise<void>} action */
async function run(action) {
  if (busy) return;
  busy = true;
  controls();
  try { await action(); } catch (error) { status(errorMessage(error), "error"); }
  finally { busy = false; controls(); }
}

/** @param {string} hash */
function showTransaction(hash) {
  const link = /** @type {HTMLAnchorElement} */ (element("transaction"));
  link.hidden = !config?.explorerUrl;
  if (config?.explorerUrl) {
    link.href = `${config.explorerUrl}/tx/${hash}`;
    link.textContent = `View transaction ${hash.slice(0, 10)}…`;
  }
}

/** @param {'fund' | 'withdraw'} action */
async function transact(action) {
  if (!contract) throw new Error("Connect your wallet first.");
  await checkNetwork();
  await refresh();
  if (!contract) throw new Error("The contract configuration changed.");
  let tx;
  if (action === "fund") {
    if (!price) throw new Error("A fresh oracle price is required before funding.");
    const value = parseEthInput(amount.value);
    if (usdValue(value, price) < MINIMUM_USD) {
      throw new Error(`Minimum contribution is $2; currently at least ${formatEther(minimumWei(price))} ETH.`);
    }
    status("Confirm the contribution in MetaMask…");
    tx = await contract.fund({ value });
  } else {
    if (account.toLowerCase() !== owner.toLowerCase()) throw new Error("Only the owner can withdraw.");
    if (!balance) throw new Error("The contract has no ETH to withdraw.");
    status("Confirm the withdrawal in MetaMask…");
    tx = await contract.withdraw();
  }
  showTransaction(tx.hash);
  status(`Transaction pending: ${tx.hash}`);
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (error) {
    const replacement = /** @type {{code?: string, cancelled?: boolean, receipt?: import('ethers').TransactionReceipt}} */ (error);
    if (replacement.code === "TRANSACTION_REPLACED" && !replacement.cancelled && replacement.receipt) {
      receipt = replacement.receipt;
      showTransaction(receipt.hash);
    } else { throw error; }
  }
  if (!receipt || receipt.status !== 1) throw new Error("The transaction did not succeed.");
  if (action === "fund") amount.value = "";
  status(`${action === "fund" ? "Contribution" : "Withdrawal"} confirmed in block ${receipt.blockNumber}.`, "success");
  try { await refresh(); } catch {
    status("Transaction confirmed. Balance refresh failed; reconnect or refresh to update it.", "success");
  }
}

button("connect").addEventListener("click", () => void run(connect));
button("refresh").addEventListener("click", () => void run(async () => { await refresh(); status("Balances and oracle status refreshed."); }));
button("withdraw").addEventListener("click", () => void run(() => transact("withdraw")));
element("fund-form").addEventListener("submit", (event) => { event.preventDefault(); void run(() => transact("fund")); });
amount.addEventListener("input", updateEstimate);
button("switch-network").addEventListener("click", () => void run(async () => {
  if (!window.ethereum || !config) return;
  const chainId = `0x${config.chainId.toString(16)}`;
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
  catch (error) {
    if (/** @type {{code?: number}} */ (error).code !== 4902 || config.chainId !== 31337) throw error;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
      chainId, chainName: "Hardhat Local", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    }] });
  }
  await connect();
}));

// Discard stale signer/chain state immediately when the wallet changes.
window.ethereum?.on?.("accountsChanged", () => window.location.reload());
window.ethereum?.on?.("chainChanged", () => window.location.reload());
window.ethereum?.on?.("disconnect", () => window.location.reload());

async function initialize() {
  try {
    const response = await fetch("/generated/deployment.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No deployment configuration is available.");
    const data = /** @type {Deployment} */ (await response.json());
    if (![31337, 11155111].includes(data.chainId) || !Array.isArray(data.abi)) throw new Error("Invalid deployment configuration.");
    getAddress(data.contractAddress);
    getAddress(data.owner);
    getAddress(data.priceFeed);
    // Explorer links are restricted to the selected testnet's official explorer.
    data.explorerUrl = data.chainId === 11155111 ? "https://sepolia.etherscan.io" : null;
    config = data;
    element("network").textContent = data.networkName;
    element("contract-address").textContent = data.contractAddress;
    status("Connect MetaMask to view the current price and contract balance.");
  } catch {
    element("network").textContent = "Deployment needed";
    status("Deploy FundMe with the deployment script, then reload this page. See frontend/README.md for setup.", "error");
  }
  controls();
}
void initialize();
