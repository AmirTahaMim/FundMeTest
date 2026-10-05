import { expect } from "chai";
import { deployFixture, ethers, networkHelpers, MINIMUM_WEI, MAX_AGE } from "./helpers.ts";

describe("FundMe withdrawal", function () {
  it("rejects a non-owner even when the contract is empty", async function () {
    const { fundMe, alice } = await networkHelpers.loadFixture(deployFixture);
    await expect(fundMe.connect(alice).withdraw()).to.be.revertedWithCustomError(fundMe, "FundMe__NotOwner");
    await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
    await expect(fundMe.connect(alice).withdraw()).to.be.revertedWithCustomError(fundMe, "FundMe__NotOwner");
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(MINIMUM_WEI);
  });

  it("explicitly rejects withdrawal from an empty contract", async function () {
    const { fundMe } = await networkHelpers.loadFixture(deployFixture);
    await expect(fundMe.withdraw()).to.be.revertedWithCustomError(fundMe, "FundMe__NothingToWithdraw");
  });

  for (const count of [1, 3]) {
    it(`withdraws all ETH from ${count} funder(s), accounting for the owner's gas`, async function () {
      const { fundMe, owner, alice, bob, charlie } = await networkHelpers.loadFixture(deployFixture);
      for (const funder of [alice, bob, charlie].slice(0, count)) {
        await fundMe.connect(funder).fund({ value: MINIMUM_WEI });
      }
      const balance = await ethers.provider.getBalance(await fundMe.getAddress());
      expect(balance).to.equal(MINIMUM_WEI * BigInt(count));
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await fundMe.withdraw();
      await expect(tx).to.emit(fundMe, "Withdrawn").withArgs(owner.address, balance);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("Withdrawal was not mined");
      const after = await ethers.provider.getBalance(owner.address);
      expect(after + receipt.fee - before).to.equal(balance);
      expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
    });
  }

  it("preserves lifetime records and does not duplicate returning funders", async function () {
    const { fundMe, alice, bob } = await networkHelpers.loadFixture(deployFixture);
    await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
    await fundMe.connect(bob).fund({ value: MINIMUM_WEI * 2n });
    await fundMe.withdraw();
    expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(MINIMUM_WEI);
    expect(await fundMe.addressToAmountFunded(bob.address)).to.equal(MINIMUM_WEI * 2n);
    expect(await fundMe.funders(0)).to.equal(alice.address);
    expect(await fundMe.funders(1)).to.equal(bob.address);
    await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
    expect(await fundMe.getFunderCount()).to.equal(2);
    expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(2n * MINIMUM_WEI);
    await fundMe.withdraw();
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
  });

  it("keeps withdrawal available when the oracle is unavailable", async function () {
    const { fundMe, feed, alice } = await networkHelpers.loadFixture(deployFixture);
    await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
    await feed.setShouldRevert(true);
    await expect(fundMe.withdraw()).to.emit(fundMe, "Withdrawn");
  });

  async function deployContractOwner() {
    const { feed, alice } = await deployFixture();
    const owner = await ethers.deployContract("OwnerHarness", [await feed.getAddress(), MAX_AGE]);
    const fundMe = await ethers.getContractAt("FundMe", await owner.fundMe());
    await fundMe.connect(alice).fund({ value: MINIMUM_WEI });
    return { owner, fundMe, alice };
  }

  it("rolls back a rejected ETH transfer and permits a later withdrawal", async function () {
    const { owner, fundMe, alice } = await networkHelpers.loadFixture(deployContractOwner);
    await owner.configure(true, false);
    await expect(owner.withdraw()).to.be.revertedWithCustomError(fundMe, "FundMe__TransferFailed");
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(MINIMUM_WEI);
    expect(await fundMe.addressToAmountFunded(alice.address)).to.equal(MINIMUM_WEI);
    await owner.configure(false, false);
    await expect(owner.withdraw()).to.emit(fundMe, "Withdrawn").withArgs(await owner.getAddress(), MINIMUM_WEI);
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
  });

  it("blocks an owner contract from reentering withdrawal", async function () {
    const { owner, fundMe } = await networkHelpers.loadFixture(deployContractOwner);
    await owner.configure(false, true);
    await owner.withdraw();
    expect(await owner.reentrySucceeded()).to.equal(false);
    expect(await owner.reentryError()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
    expect(await ethers.provider.getBalance(await fundMe.getAddress())).to.equal(0);
    expect(await ethers.provider.getBalance(await owner.getAddress())).to.equal(MINIMUM_WEI);
  });
});
