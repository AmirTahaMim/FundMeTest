import { network } from "hardhat";
import { LOCAL } from "../config/networks.ts";

const connection = await network.create();
try {
  const { ethers } = connection;
  if ((await ethers.provider.getNetwork()).chainId !== BigInt(LOCAL.chainId)) {
    throw new Error("The mock-price refresh script is only permitted on the local Hardhat network.");
  }
  const address = process.env.FUNDME_ADDRESS?.trim();
  if (!address) throw new Error("Set FUNDME_ADDRESS in .env to your local deployed FundMe address.");
  const fundMe = await ethers.getContractAt("FundMe", address);
  const feed = await ethers.getContractAt("MockV3Aggregator", await fundMe.getPriceFeed());
  await (await feed.updateAnswer(LOCAL.initialAnswer)).wait();
  console.log("Refreshed the local mock ETH/USD price to $2000.");
} finally {
  await connection.close();
}
