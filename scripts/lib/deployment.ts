import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifacts, network } from "hardhat";
import { LOCAL, SEPOLIA, deploymentSettings } from "../../config/networks.ts";

type Connection = Awaited<ReturnType<typeof network.create>>;

export async function deployFundMe(connection: Connection) {
  const { ethers } = connection;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const settings = deploymentSettings(chainId);
  let priceFeed: string;
  if (chainId === BigInt(SEPOLIA.chainId)) {
    priceFeed = SEPOLIA.priceFeed;
  } else if (process.env.LOCAL_PRICE_FEED_ADDRESS?.trim()) {
    priceFeed = ethers.getAddress(process.env.LOCAL_PRICE_FEED_ADDRESS.trim());
  } else {
    const mock = await ethers.deployContract("MockV3Aggregator", [LOCAL.decimals, LOCAL.initialAnswer]);
    await mock.waitForDeployment();
    priceFeed = await mock.getAddress();
  }

  if (await ethers.provider.getCode(priceFeed) === "0x") {
    throw new Error("The selected price feed has no contract code on this network.");
  }
  const fundMe = await ethers.deployContract("FundMe", [priceFeed, settings.maxPriceAge]);
  await fundMe.waitForDeployment();
  // Read through the consumer's validation before announcing a usable deployment.
  await fundMe.getPrice();
  return fundMe;
}

export async function exportDeployment(connection: Connection, address: string, outputRoot = process.cwd()) {
  const { ethers } = connection;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const settings = deploymentSettings(chainId);
  const contractAddress = ethers.getAddress(address);
  if (await ethers.provider.getCode(contractAddress) === "0x") {
    throw new Error("No contract exists at FUNDME_ADDRESS on the selected network.");
  }
  const fundMe = await ethers.getContractAt("FundMe", contractAddress);
  const [owner, priceFeed, maxPriceAge, minimumUsd] = await Promise.all([
    fundMe.i_owner(), fundMe.getPriceFeed(), fundMe.maxPriceAge(), fundMe.MINIMUM_USD(),
  ]);
  if (minimumUsd !== ethers.parseEther("2")) throw new Error("This contract does not have the expected $2 minimum.");
  if (chainId === BigInt(SEPOLIA.chainId) && priceFeed.toLowerCase() !== SEPOLIA.priceFeed.toLowerCase()) {
    throw new Error("The Sepolia contract is configured with an unexpected Chainlink feed.");
  }
  const artifact = await artifacts.readArtifact("FundMe");
  const deployment = {
    contractAddress,
    chainId: Number(chainId),
    networkName: settings.name,
    owner,
    priceFeed,
    maxPriceAge: maxPriceAge.toString(),
    minimumUsd: minimumUsd.toString(),
    explorerUrl: chainId === BigInt(SEPOLIA.chainId) ? SEPOLIA.explorerUrl : null,
    abi: artifact.abi,
  };
  const generated = resolve(outputRoot, "frontend/public/generated");
  const deployments = resolve(outputRoot, "deployments");
  await mkdir(generated, { recursive: true });
  await mkdir(deployments, { recursive: true });
  const json = `${JSON.stringify(deployment, null, 2)}\n`;
  await writeFile(resolve(generated, "deployment.json"), json);
  await writeFile(resolve(deployments, `${chainId}.json`), json);
  return deployment;
}
