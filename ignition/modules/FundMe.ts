import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { SEPOLIA } from "../../config/networks.ts";

// Sepolia module: the official address is deliberately not overridden by .env.
export default buildModule("FundMeModule", (m) => {
  const fundMe = m.contract("FundMe", [SEPOLIA.priceFeed, SEPOLIA.maxPriceAge]);
  return { fundMe };
});
