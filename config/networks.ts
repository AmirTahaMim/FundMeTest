// The single runtime source of truth for the official Ethereum Sepolia feed.
export const SEPOLIA = {
  chainId: 11155111,
  name: "Ethereum Sepolia",
  priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  maxPriceAge: 3600,
  explorerUrl: "https://sepolia.etherscan.io",
} as const;

export const LOCAL = {
  chainId: 31337,
  name: "Hardhat Local",
  maxPriceAge: 3600,
  decimals: 8,
  initialAnswer: 2000n * 10n ** 8n,
} as const;

export function deploymentSettings(chainId: bigint) {
  if (chainId === BigInt(SEPOLIA.chainId)) return SEPOLIA;
  if (chainId === BigInt(LOCAL.chainId)) return LOCAL;
  throw new Error(`Unsupported chain ${chainId}; only local Hardhat and Ethereum Sepolia are allowed.`);
}
