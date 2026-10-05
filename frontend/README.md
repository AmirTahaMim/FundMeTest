# FundMe frontend

Plain HTML/CSS/JavaScript, ethers v6, Vite, and MetaMask. Run every command below from the repository root. Node 22.13+ or 24 LTS is required.

## Start locally

```bash
npm install
npx hardhat compile
npx hardhat node --network hardhat
```

Keep that terminal running. In another terminal:

```bash
npx hardhat run scripts/deploy.ts --network localhost
npm run frontend:dev
```

Open `http://127.0.0.1:5173`. Use a disposable MetaMask development profile, add the network `http://127.0.0.1:8545` with chain ID `31337` and symbol `ETH`, and import a test account printed by the local node. Its first account is the deployer/owner. These public test accounts must never hold real funds.

1. Click **Connect MetaMask** and approve the wallet connection.
2. Confirm the displayed contract address and network match the deployment output.
3. Read ETH/USD and the contract balance. At the initial mock price, `0.001 ETH` is $2.
4. Enter the ETH amount and click **Fund Contract**.
5. Confirm the transaction in MetaMask and wait for a confirmation message.
6. Switch to the first Hardhat account, reconnect, and use **Withdraw all ETH** in the owner panel.
7. Switch to a different account to check that owner controls are hidden. The contract also enforces authorization.

The mock price expires after one hour of chain time. Set `FUNDME_ADDRESS` in the root `.env` and run:

```bash
npx hardhat run scripts/refresh-local-price.ts --network localhost
```

## Use Ethereum Sepolia

Configure `SEPOLIA_RPC_URL` and a dedicated testnet `PRIVATE_KEY` in the root `.env`, then:

```bash
npx hardhat run scripts/deploy.ts --network sepolia --build-profile production
npm run frontend:dev
```

Select Ethereum Sepolia (11155111) in MetaMask. The connected wallet needs Sepolia ETH for both the contribution and gas. The owner is the deployment wallet. The live feed changes, so use the displayed current minimum rather than assuming `0.001 ETH` is always sufficient.

## Address, ABI, and network configuration

The deployment script generates `frontend/public/generated/deployment.json` from the compiled artifact and deployed getters. It contains only public data: contract address, ABI, chain ID, owner, feed, timeout, minimum, and explorer URL. There is no hardcoded fake contract address or copied ABI.

For an existing script or Ignition deployment, set `FUNDME_ADDRESS` in `.env` and export:

```bash
npx hardhat run scripts/export-frontend.ts --network localhost
# Or:
npx hardhat run scripts/export-frontend.ts --network sepolia --build-profile production
```

The latest export determines the target network. Reload the frontend afterward. Rebuild an already-built frontend after changing this file. A local node restart requires redeployment. Without generated configuration, the UI displays a setup message and disables interaction.

The UI confirms the wallet's chain, contract code, owner, feed, and $2 minimum before enabling transactions. It uses the actual ABI for calls and custom error decoding. Contract calls and wallet RPC errors are shown as text, never injected HTML.

## Validation and transaction behavior

Amounts are parsed as integer wei with at most 18 fractional digits. Negative, zero, scientific-notation, and malformed input is rejected. Quotes and minimum checks use `bigint`. Displayed dollars are rounded down for presentation; the exact integer value determines frontend validation.

The contract remains the final authority. Prices may change before mining, and the gas fee is separate. Contributions are nonrefundable donations to the owner. The UI never modifies the entered contribution automatically.

The UI disables repeated submissions while awaiting wallet approval/mining, handles user rejection and transaction replacement, and links Sepolia transactions to Etherscan. Account/network changes reload the page to discard old signer state. If a transaction was pending when the page reloaded, inspect MetaMask's activity or Etherscan before sending again.

Oracle failures disable funding. They do not block an eligible owner's withdrawal controls, because withdrawal does not use the price feed.

## Test and build

```bash
npm run test:frontend
npm run typecheck
npm run frontend:build
npm run frontend:preview
```

The production output is `frontend/dist/`; preview runs on `http://127.0.0.1:4173`. Host only that built directory. Never host the repository root or copy `.env` into a public directory. Vite bundles ethers from npm; the app uses no external CDN or off-chain price service.

Automated frontend tests exercise the exact amount parsing and USD boundary arithmetic. Deployment integration tests exercise the exported ABI against a local EVM. A real MetaMask/browser smoke test remains separate; see the repository's [validation status](../VALIDATION.md).
