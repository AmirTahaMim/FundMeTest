import { network } from "hardhat";
import { exportDeployment } from "./lib/deployment.ts";

const address = process.env.FUNDME_ADDRESS?.trim();
if (!address) throw new Error("Set FUNDME_ADDRESS in .env to your deployed FundMe contract address.");
const connection = await network.create();
try {
  const deployment = await exportDeployment(connection, address);
  console.log(`Exported ${deployment.contractAddress} on ${deployment.networkName}.`);
} finally {
  await connection.close();
}
