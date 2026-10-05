import test from "node:test";
import assert from "node:assert/strict";
import { MINIMUM_USD, WAD, formatUsd, minimumWei, parseEthInput, usdValue } from "../src/amounts.js";

test("parses wei exactly without floating-point rounding", () => {
  assert.equal(parseEthInput("0.001"), 1_000_000_000_000_000n);
  assert.equal(parseEthInput(".001"), 1_000_000_000_000_000n);
  assert.equal(parseEthInput(" 1.000000000000000001 "), WAD + 1n);
  assert.equal(parseEthInput("0.000000000000000001"), 1n);
});

test("rejects zero, negative, nondecimal, and overly precise inputs", () => {
  for (const value of ["", "0", "0.000", "-1", "1e-3", "NaN", "Infinity", "1,000", "0x10", "0.0000000000000000001", "1.", "1.2.3", "1 2", "9".repeat(100)]) {
    assert.throws(() => parseEthInput(value), Error, value);
  }
});

for (const [dollars, eth, accepted] of [
  ["1.99", "0.000995", false],
  ["2.00", "0.001", true],
  ["2.01", "0.001005", true],
  ["10.00", "0.005", true],
  ["1000.00", "0.5", true],
]) {
  test(`frontend $${dollars} validation agrees with the contract's minimum rule`, () => {
    const quote = usdValue(parseEthInput(String(eth)), 2000n * WAD);
    assert.equal(quote >= MINIMUM_USD, accepted);
  });
}

test("uses upward rounding at $3000", () => {
  const price = 3000n * WAD;
  assert.equal(minimumWei(price), 666_666_666_666_667n);
  assert.ok(usdValue(minimumWei(price) - 1n, price) < MINIMUM_USD);
  assert.ok(usdValue(minimumWei(price), price) >= MINIMUM_USD);
});

test("does not round one wei below the minimum up to an accepted contribution", () => {
  const price = 2000n * WAD;
  assert.ok(usdValue(minimumWei(price) - 1n, price) < MINIMUM_USD);
  assert.ok(usdValue(minimumWei(price) + 1n, price) >= MINIMUM_USD);
});

test("rejects invalid prices before calculating a minimum", () => {
  assert.throws(() => minimumWei(0n));
  assert.throws(() => minimumWei(-1n));
});

test("formats dollar amounts without losing large integer precision", () => {
  assert.equal(formatUsd(2000n * WAD), "$2,000.00");
  assert.equal(formatUsd(2n * WAD + 10n ** 16n), "$2.01");
  assert.equal(formatUsd(0n), "$0.00");
});
