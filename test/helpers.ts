import { network } from "hardhat";

// Explicitly create a local simulation, even if someone passes --network sepolia.
// These tests never use an RPC or the live oracle.
export const { ethers, networkHelpers } = await network.create("hardhat");
export const PRICE = 2000n * 10n ** 8n;
export const MINIMUM_WEI = 10n ** 15n;
export const MAX_AGE = 3600;

export async function deployFixture() {
  const [owner, alice, bob, charlie] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockV3Aggregator", [8, PRICE]);
  await feed.waitForDeployment();
  const fundMe = await ethers.deployContract("FundMe", [await feed.getAddress(), MAX_AGE]);
  await fundMe.waitForDeployment();
  return { owner, alice, bob, charlie, feed, fundMe };
}
