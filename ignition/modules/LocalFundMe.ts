import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { LOCAL } from "../../config/networks.ts";

export default buildModule("LocalFundMeModule", (m) => {
  const mock = m.contract("MockV3Aggregator", [LOCAL.decimals, LOCAL.initialAnswer]);
  const fundMe = m.contract("FundMe", [mock, LOCAL.maxPriceAge]);
  return { mock, fundMe };
});
