# Validation status

Recorded on 2026-10-05. **The complete project is not yet validated.** This file distinguishes executed checks from authored tests that could not run.

## Executed successfully

- `npm run test:frontend` completed successfully using Linux Node v22.18.0 and npm 11.6.2 located in the environment.
- A direct `node frontend/test/amounts.test.js` run reported **11 tests passed, 0 failed**. This checks exact ETH input parsing, invalid input, $1.99/$2/$2.01/$10/$1000 validation, upward wei rounding, adjacent wei boundaries, invalid quote prices, and formatting. It does not execute Solidity.
- `node --check` passed for all 17 executable JavaScript/TypeScript source files. Declaration files were excluded. Syntax checking is not type checking or contract compilation.
- The available local TypeScript 5.9.2 compiler checked `frontend/src/amounts.js` with `checkJs`, strict mode, ES2022, and no emit: **0 diagnostics**. This is a limited arithmetic-module check, not the configured whole-project type check.
- Source inspection confirmed the official Sepolia feed literal appears in exactly one runtime configuration file, the ABI is exported from the compiled artifact rather than handwritten, tests select a local simulated network, and no `.env` or real private key was created.

## Attempted but blocked

| Command / operation | Actual result |
| --- | --- |
| First Git command: `git init` | Failed: cannot write `.git/description`, read-only filesystem |
| `git add ...` for the initialization stage | Failed: cannot create `.git/index.lock`, read-only filesystem; no commit was made |
| `npm install` | Failed with `EAI_AGAIN`: npm registry DNS/network unavailable; repeated after the environment was rechecked |
| `npx hardhat compile` | Blocked: Hardhat absent; npm's offline cache has no package (`ENOTCACHED`) |
| `npx hardhat test` | Blocked for the same reason; no Solidity/unit/integration tests were executed |
| `npx hardhat test --coverage` | Blocked for the same reason; no coverage report or percentage exists |
| `npm run typecheck` | Failed before type checking: `hardhat: not found` |
| `npm run frontend:build` | Failed: `vite: not found` |
| `git status` | Repository metadata became readable during the work; branch `main`, no commits, project files untracked |
| `git log --oneline --decorate --graph` | Failed: branch `main` has no commits |

The `npx` validation attempts used offline mode after the failed install to prevent an implicit download or interactive installation. This does not constitute running Hardhat. npm 11 was invoked with the available Linux Node binary because the default `npm` command points at a Windows installation that fails in this shell. Temporary tooling wrappers and npm logs were kept under `/tmp`, outside the project.

Git metadata was initialized externally or became visible during the work, but write operations still fail. No alternate Git directory was created to bypass that restriction. No fake history, lockfile, ABI, deployed address, test result, or coverage result is supplied.

## Remaining work once the environment is usable

1. Enable writable repository Git metadata and npm registry access; use a supported Linux Node/npm pair (or run both tools natively on Windows).
2. Run `npm install`, resolve any dependency/compiler/type/test issues it exposes, and retain the generated `package-lock.json`.
3. Run:

   ```bash
   npx hardhat compile
   npx hardhat test
   npx hardhat test --coverage
   npm run test:frontend
   npm run typecheck
   npm run frontend:build
   ```

4. Start the local node, deploy, and manually exercise MetaMask connection, wrong-network handling, funding, account changes, and owner withdrawal. No real-browser/MetaMask test has been performed here.
5. Commit the logical file groups using the Conventional Commit subjects in the README, then inspect `git status` and `git log --oneline --decorate --graph`. No commits currently exist.
6. If desired, configure a dedicated funded Sepolia wallet, deploy, verify, and perform a testnet smoke test. No public transaction or verification has been attempted.

Do not call the project production-ready until the blocked build/test checks and a security review have been completed.
