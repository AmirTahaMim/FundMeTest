import { expect } from "chai";
import { deployFixture, ethers, networkHelpers, MINIMUM_WEI, MAX_AGE } from "./helpers.ts";

describe("FundMe", function () {
  describe("constructor", function () {
    it("deploys with the deployer as immutable owner and the configured feed", async function () {
      const { fundMe, feed, owner } = await networkHelpers.loadFixture(deployFixture);
      expect(await ethers.provider.getCode(await fundMe.getAddress())).not.to.equal("0x");
      expect(await fundMe.i_owner()).to.equal(owner.address);
      expect(await fundMe.getPriceFeed()).to.equal(await feed.getAddress());
      expect(await fundMe.feedDecimals()).to.equal(8);
      expect(await fundMe.maxPriceAge()).to.equal(MAX_AGE);
      expect(await fundMe.MINIMUM_USD()).to.equal(ethers.parseEther("2"));
      expect(await fundMe.getFunderCount()).to.equal(0);
    });

    it("rejects the zero address and addresses without contract code", async function () {
      const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
      for (const address of [ethers.ZeroAddress, alice.address]) {
        await expect(ethers.deployContract("FundMe", [address, MAX_AGE]))
          .to.be.revertedWithCustomError(fundMe, "FundMe__InvalidPriceFeed");
      }
    });

    it("rejects a zero oracle timeout", async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      await expect(ethers.deployContract("FundMe", [await feed.getAddress(), 0]))
        .to.be.revertedWithCustomError(fundMe, "FundMe__InvalidMaxPriceAge");
    });

    for (const decimals of [19, 255]) {
      it(`explicitly rejects ${decimals} oracle decimals`, async function () {
        const { fundMe } = await networkHelpers.loadFixture(deployFixture);
        const feed = await ethers.deployContract("MockV3Aggregator", [decimals, 2000n]);
        await expect(ethers.deployContract("FundMe", [await feed.getAddress(), MAX_AGE]))
          .to.be.revertedWithCustomError(fundMe, "FundMe__UnsupportedDecimals").withArgs(decimals);
      });
    }
  });

  describe("price feed and conversion", function () {
    for (const decimals of [0, 6, 8, 18]) {
      it(`normalizes $2000 from a ${decimals}-decimal feed and enforces the exact boundary`, async function () {
        const feed = await ethers.deployContract("MockV3Aggregator", [decimals, 2000n * 10n ** BigInt(decimals)]);
        const fundMe = await ethers.deployContract("FundMe", [await feed.getAddress(), MAX_AGE]);
        expect(await fundMe.getPrice()).to.equal(ethers.parseEther("2000"));
        expect(await fundMe.getConversionRate(MINIMUM_WEI)).to.equal(ethers.parseEther("2"));
        await expect(fundMe.fund({ value: MINIMUM_WEI - 1n }))
          .to.be.revertedWithCustomError(fundMe, "FundMe__MinimumContributionNotMet");
        await expect(fundMe.fund({ value: MINIMUM_WEI })).to.emit(fundMe, "Funded");
      });
    }

    it("queries the feed version and uses a changed oracle answer", async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      expect(await fundMe.getVersion()).to.equal(4);
      await feed.updateAnswer(3000n * 10n ** 8n);
      expect(await fundMe.getPrice()).to.equal(ethers.parseEther("3000"));
      expect(await fundMe.getConversionRate(MINIMUM_WEI)).to.equal(ethers.parseEther("3"));
    });

    it("rounds the minimum wei upward at $3000 and rejects one wei less", async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      await feed.updateAnswer(3000n * 10n ** 8n);
      const minimum = 666_666_666_666_667n;
      expect(await fundMe.getMinimumContributionWei()).to.equal(minimum);
      await expect(fundMe.fund({ value: minimum - 1n }))
        .to.be.revertedWithCustomError(fundMe, "FundMe__MinimumContributionNotMet");
      await expect(fundMe.fund({ value: minimum })).to.emit(fundMe, "Funded");
    });

    it("preserves fractional dollar oracle prices", async function () {
      const { fundMe, feed } = await networkHelpers.loadFixture(deployFixture);
      await feed.updateAnswer(2000_12345678n);
      expect(await fundMe.getPrice()).to.equal(ethers.parseEther("2000.12345678"));
    });

    it("handles a product larger than uint256 when its divided result fits", async function () {
      const { fundMe } = await networkHelpers.loadFixture(deployFixture);
      const amount = ethers.MaxUint256 / 2000n;
      expect(await fundMe.getConversionRate(amount)).to.equal(amount * 2000n);
    });
  });

  describe("fund", function () {
    describe("minimum contribution", function () {
      for (const [label, amount] of [
        ["zero", 0n],
        ["$1.99", 995_000_000_000_000n],
        ["one wei below $2", MINIMUM_WEI - 1n],
      ] as const) {
        it(`reverts for ${label} and leaves balance and records untouched`, async function () {
          const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
          await expect(fundMe.connect(alice).fund({ value: amount }))
            .to.be.revertedWithCustomError(fundMe, "FundMe__MinimumContributionNotMet")
            .withArgs(amount * 2000n);
          expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(0);
          expect(await fundMe.getFunderCount()).to.equal(0);
          expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
        });
      }

      for (const [label, amount] of [
        ["exactly $2.00", MINIMUM_WEI],
        ["one wei above $2", MINIMUM_WEI + 1n],
        ["$2.01", 1_005_000_000_000_000n],
        ["$10", 5_000_000_000_000_000n],
        ["$1000 (there is no maximum)", 500_000_000_000_000_000n],
      ] as const) {
        it(`accepts ${label} and emits the ETH and USD amounts`, async function () {
          const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
          await expect(fundMe.connect(alice).fund({ value: amount }))
            .to.emit(fundMe, "Funded").withArgs(alice.address, amount, amount * 2000n);
          expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(amount);
          expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(amount);
        });
      }
    });

    describe("mapping and funder list", function () {
      it("records Alice, Bob, and Charlie in insertion order", async function () {
        const { fundMe, alice, bob, charlie } = await networkHelpers.loadFixture(deployFixture);
        for (const [index, funder] of [alice, bob, charlie].entries()) {
          const amount = MINIMUM_WEI * BigInt(index + 1);
          await fundMe.connect(funder).fund({ value: amount });
          expect(await fundMe.addressToAmountFunded(funder.address)).to.equal(amount);
          expect(await fundMe.funders(index)).to.equal(funder.address);
        }
        expect(await fundMe.getFunderCount()).to.equal(3);
      });

      it("adds a repeated funder once and accumulates their ETH contribution", async function () {
        const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
        await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
        await fundMe.connect(alice).fund({ value: 2n * MINIMUM_WEI });
        expect(await fundMe.getFunderCount()).to.equal(1);
        expect(await fundMe.funders(0)).to.equal(alice.address);
        expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(3n * MINIMUM_WEI);
      });
    });

    it("routes plain ETH transfers through the same funding checks", async function () {
      const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
      await expect(alice.sendTransaction({ to: await fundMe.getAddress(), value: MINIMUM_WEI }))
        .to.emit(fundMe, "Funded").withArgs(alice.address, MINIMUM_WEI, ethers.parseEther("2"));
      await expect(alice.sendTransaction({ to: await fundMe.getAddress(), value: MINIMUM_WEI - 1n }))
        .to.be.revertedWithCustomError(fundMe, "FundMe__MinimumContributionNotMet");
    });

    it("rejects unknown calldata even when enough ETH is attached", async function () {
      const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
      await expect(alice.sendTransaction({ to: await fundMe.getAddress(), value: MINIMUM_WEI, data: "0x12345678" }))
        .to.be.revertedWithCustomError(fundMe, "FundMe__UnknownCall");
    });
  });
});
