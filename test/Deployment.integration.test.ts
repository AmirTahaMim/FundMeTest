import { expect } from "chai";
import { artifacts, network } from "hardhat";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployFundMe, exportDeployment } from "../scripts/lib/deployment.ts";
import { LOCAL, SEPOLIA, deploymentSettings } from "../config/networks.ts";
import LocalFundMeModule from "../ignition/modules/LocalFundMe.ts";

describe("Local deployment integration", function () {
  it("deploys a mock, exports the actual ABI, then funds and withdraws", async function () {
    const connection = await network.create("hardhat");
    const directory = await mkdtemp(join(tmpdir(), "fundme-export-"));
    const previousFeed = process.env.LOCAL_PRICE_FEED_ADDRESS;
    delete process.env.LOCAL_PRICE_FEED_ADDRESS;
    try {
      const fundMe = await deployFundMe(connection);
      const address = await fundMe.getAddress();
      const output = await exportDeployment(connection, address, directory);
      const artifact = await artifacts.readArtifact("FundMe");
      const disk = JSON.parse(await readFile(join(directory, "frontend/public/generated/deployment.json"), "utf8"));
      expect(disk).to.deep.equal(output);
      expect(disk.abi).to.deep.equal(artifact.abi);
      expect(disk.contractAddress).to.equal(address);
      expect(disk.chainId).to.equal(LOCAL.chainId);
      expect(disk.minimumUsd).to.equal("2000000000000000000");
      expect(disk.owner).to.equal(await fundMe.i_owner());
      expect(disk.priceFeed).to.equal(await fundMe.getPriceFeed());
      expect(JSON.parse(await readFile(join(directory, "deployments/31337.json"), "utf8"))).to.deep.equal(disk);

      // Use precisely what the frontend receives, rather than the deployment helper's instance.
      const [owner, alice] = await connection.ethers.getSigners();
      const client = new connection.ethers.Contract(disk.contractAddress, disk.abi, alice);
      const value = await client.getMinimumContributionWei();
      await (await client.fund({ value })).wait();
      expect(await connection.ethers.provider.getBalance(address)).to.equal(value);
      const ownerClient = new connection.ethers.Contract(disk.contractAddress, disk.abi, owner);
      await (await ownerClient.withdraw()).wait();
      expect(await connection.ethers.provider.getBalance(address)).to.equal(0);
    } finally {
      if (previousFeed === undefined) delete process.env.LOCAL_PRICE_FEED_ADDRESS;
      else process.env.LOCAL_PRICE_FEED_ADDRESS = previousFeed;
      await connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("deploys the local Ignition module with a functioning mock feed", async function () {
    const connection = await network.create("hardhat");
    try {
      const { fundMe, mock } = await connection.ignition.deploy(LocalFundMeModule);
      expect(await fundMe.getPriceFeed()).to.equal(await mock.getAddress());
      expect(await fundMe.getPrice()).to.equal(2000n * 10n ** 18n);
    } finally {
      await connection.close();
    }
  });

  it("selects the official Sepolia configuration and refuses mainnet", function () {
    expect(deploymentSettings(11155111n)).to.equal(SEPOLIA);
    expect(deploymentSettings(31337n)).to.equal(LOCAL);
    expect(() => deploymentSettings(1n)).to.throw("only local Hardhat and Ethereum Sepolia");
    expect(() => deploymentSettings(42161n)).to.throw("Unsupported chain");
  });
});
