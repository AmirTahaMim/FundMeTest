import "dotenv/config";
import { createRequire } from "node:module";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { LOCAL, SEPOLIA } from "./config/networks.ts";

const require = createRequire(import.meta.url);
const compiler = {
  version: "0.8.28",
  // Installing solc with npm makes subsequent compilation work offline too.
  path: require.resolve("solc/soljson.js"),
  preferWasm: true,
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: { profiles: { default: compiler, production: compiler } },
  networks: {
    hardhat: { type: "edr-simulated", chainType: "l1", chainId: LOCAL.chainId },
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545", chainId: LOCAL.chainId },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: SEPOLIA.chainId,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
});
