export const WAD = 10n ** 18n;
export const MINIMUM_USD = 2n * WAD;

/** Parse decimal ETH exactly, without JavaScript floating-point arithmetic.
 * @param {string} input
 * @returns {bigint}
 */
export function parseEthInput(input) {
  const value = input.trim();
  if (!/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(value)) {
    throw new Error("Enter a positive ETH amount with at most 18 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const wei = BigInt(whole || "0") * WAD + BigInt(fraction.padEnd(18, "0"));
  if (wei === 0n) throw new Error("Enter an ETH amount greater than zero.");
  if (wei >= 1n << 256n) throw new Error("The ETH amount exceeds the supported integer range.");
  return wei;
}

/** @param {bigint} wei @param {bigint} price */
export function usdValue(wei, price) {
  return wei * price / WAD;
}

/** @param {bigint} price */
export function minimumWei(price) {
  if (price <= 0n) throw new Error("A valid ETH/USD price is unavailable.");
  return (MINIMUM_USD * WAD + price - 1n) / price;
}

/** Format USD to cents for display only; never use this rounded value to validate.
 * @param {bigint} value
 */
export function formatUsd(value) {
  const cents = value / 10n ** 16n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}
