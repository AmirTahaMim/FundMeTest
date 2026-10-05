import { network } from "hardhat";
import { deployFundMe, exportDeployment } from "./lib/deployment.ts";

const connection = await network.create();
try {
  const fundMe = await deployFundMe(connection);
  const address = await fundMe.getAddress();
  console.log(`FundMe deployed at ${address}`);
  console.log(`Owner: ${await fundMe.i_owner()}`);
  console.log(`Price feed: ${await fundMe.getPriceFeed()}`);
  if (connection.networkName === "localhost" || connection.networkName === "sepolia") {
    await exportDeployment(connection, address);
    console.log("Generated frontend/public/generated/deployment.json from the compiled ABI.");
  } else {
    console.log("This in-process network is temporary. Use --network localhost for the frontend.");
  }
} finally {
  await connection.close();
}
