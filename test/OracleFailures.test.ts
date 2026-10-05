import { expect } from "chai";
import { deployFixture, ethers, networkHelpers, MINIMUM_WEI, MAX_AGE, PRICE } from "./helpers.ts";

describe("FundMe oracle failures", function () {
  for (const answer of [0n, -1n, -2000n * 10n ** 8n]) {
    it(`rejects the invalid answer ${answer} in reads and funding`, async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      await feed.updateAnswer(answer);
      await expect(fundMe.getPrice()).to.be.revertedWithCustomError(fundMe, "FundMe__InvalidPrice");
      await expect(fundMe.fund({ value: MINIMUM_WEI })).to.be.revertedWithCustomError(fundMe, "FundMe__InvalidPrice");
    });
  }

  it("rejects an answer that would overflow decimal normalization", async function () {
    const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
    await feed.updateAnswer((1n << 255n) - 1n);
    await expect(fundMe.getPrice()).to.be.revertedWithCustomError(fundMe, "FundMe__InvalidPrice");
  });

  for (const [name, roundId, answeredInRound, offset] of [
    ["zero timestamp", 1, 1, null],
    ["future timestamp", 1, 1, 1000],
    ["zero round ID", 0, 0, 0],
    ["incomplete round", 2, 1, 0],
  ] as const) {
    it(`rejects ${name}`, async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      const now = await networkHelpers.time.latest();
      await feed.setRoundData(roundId, PRICE, offset === null ? 0 : now + offset, answeredInRound);
      await expect(fundMe.getPrice()).to.be.revertedWithCustomError(fundMe, "FundMe__InvalidRoundData");
      await expect(fundMe.fund({ value: MINIMUM_WEI }))
        .to.be.revertedWithCustomError(fundMe, "FundMe__InvalidRoundData");
    });
  }

  it("accepts exactly the maximum age and rejects one second beyond it", async function () {
    const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
    const [, , , updatedAt] = await feed.latestRoundData();
    await networkHelpers.time.increaseTo(Number(updatedAt) + MAX_AGE);
    expect(await fundMe.getPrice()).to.equal(ethers.parseEther("2000"));
    await networkHelpers.time.increase(1);
    await expect(fundMe.getPrice()).to.be.revertedWithCustomError(fundMe, "FundMe__StalePrice")
      .withArgs(updatedAt, updatedAt + BigInt(MAX_AGE) + 1n);
    await expect(fundMe.fund({ value: MINIMUM_WEI })).to.be.revertedWithCustomError(fundMe, "FundMe__StalePrice");
  });

  it("accepts a fresh round after rejecting stale data", async function () {
    const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
    await networkHelpers.time.increase(MAX_AGE + 1);
    await expect(fundMe.fund({ value: MINIMUM_WEI })).to.be.revertedWithCustomError(fundMe, "FundMe__StalePrice");
    await feed.updateAnswer(PRICE);
    await expect(fundMe.fund({ value: MINIMUM_WEI })).to.emit(fundMe, "Funded");
  });

  it("fails closed when the oracle itself reverts", async function () {
    const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
    await feed.setShouldRevert(true);
    await expect(fundMe.fund({ value: MINIMUM_WEI })).to.be.revertedWithCustomError(feed, "MockOracle__Unavailable");
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
    expect(await fundMe.getFunderCount()).to.equal(0);
  });
});
