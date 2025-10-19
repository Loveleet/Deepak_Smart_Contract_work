import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers.js";

const { ethers } = hre;

const SLOT_BUY = 0;
const DIRECT_COMMISSION = 1;
const ROYALTY_TRANSFER = 2;
const SUPER_ROYALTY_TRANSFER = 3;
const CREATOR_TRANSFER = 4;
const FLASH_TRANSFER = 5;

const toUnits = (value: string) => ethers.parseUnits(value, 18);

describe("LABToken", () => {
  async function deployTokenFixture() {
    const [admin, user, recipient, referrer, payee1, payee2, flashOperator] = await ethers.getSigners();
    const LabToken = await ethers.getContractFactory("LABToken");
    const token = await LabToken.deploy(
      "LAB Token",
      "LAB",
      toUnits("1000000"),
      admin.address,
      admin.address,
      admin.address,
      admin.address
    );

    const defaultConfigs = [
      {
        feeType: SLOT_BUY,
        config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 25, referrerFeeBps: 25 }
      },
      {
        feeType: DIRECT_COMMISSION,
        config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
      },
      {
        feeType: ROYALTY_TRANSFER,
        config: { platformFeeBps: 75, creatorFeeBps: 0, royaltyFeeBps: 75, referrerFeeBps: 0 }
      },
      {
        feeType: SUPER_ROYALTY_TRANSFER,
        config: { platformFeeBps: 75, creatorFeeBps: 25, royaltyFeeBps: 50, referrerFeeBps: 0 }
      },
      {
        feeType: CREATOR_TRANSFER,
        config: { platformFeeBps: 50, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
      },
      {
        feeType: FLASH_TRANSFER,
        config: { platformFeeBps: 25, creatorFeeBps: 0, royaltyFeeBps: 0, referrerFeeBps: 0 }
      }
    ];

    for (const { feeType, config } of defaultConfigs) {
      await token.setFees(feeType, config);
    }

    await token.transfer(user.address, toUnits("1000"));
    await token.grantRole(await token.FLASH_ROLE(), flashOperator.address);

    return {
      token,
      admin,
      user,
      recipient,
      referrer,
      payee1,
      payee2,
      flashOperator
    };
  }

  it("deploys with correct metadata and roles", async () => {
    const { token, admin } = await loadFixture(deployTokenFixture);
    expect(await token.name()).to.equal("LAB Token");
    expect(await token.symbol()).to.equal("LAB");
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    expect(await token.hasRole(await token.FEE_MANAGER_ROLE(), admin.address)).to.be.true;
    expect(await token.hasRole(await token.FLASH_ROLE(), admin.address)).to.be.true;
  });

  it("sets and reads fee configurations", async () => {
    const { token } = await loadFixture(deployTokenFixture);
    const fees = await token.getFees(SLOT_BUY);
    expect(fees.platformFeeBps).to.equal(100);
    expect(fees.creatorFeeBps).to.equal(50);
    expect(fees.royaltyFeeBps).to.equal(25);
    expect(fees.referrerFeeBps).to.equal(25);
  });

  it("prevents non fee-manager from updating fees", async () => {
    const { token, user } = await loadFixture(deployTokenFixture);
    await expect(
      token.connect(user).setFees(SLOT_BUY, {
        platformFeeBps: 10,
        creatorFeeBps: 0,
        royaltyFeeBps: 0,
        referrerFeeBps: 0
      })
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("enforces fee caps", async () => {
    const { token } = await loadFixture(deployTokenFixture);
    await expect(
      token.setFees(SLOT_BUY, {
        platformFeeBps: 800,
        creatorFeeBps: 300,
        royaltyFeeBps: 0,
        referrerFeeBps: 0
      })
    ).to.be.revertedWith("Combined fees too high");
  });

  it("slotBuy distributes fees and emits event", async () => {
    const { token, user, recipient, referrer, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("100");
    const platformFee = amount / 100n;
    const creatorFee = (amount * 50n) / 10000n;
    const royaltyFee = (amount * 25n) / 10000n;
    const referrerFee = (amount * 25n) / 10000n;
    const netAmount = amount - platformFee - creatorFee - royaltyFee - referrerFee;

    await expect(token.connect(user).slotBuy(recipient.address, amount, referrer.address))
      .to.emit(token, "SlotBuy")
      .withArgs(
        user.address,
        recipient.address,
        referrer.address,
        amount,
        netAmount,
        platformFee,
        creatorFee,
        royaltyFee,
        referrerFee
      );

    expect(await token.balanceOf(recipient.address)).to.equal(netAmount);
    expect(await token.balanceOf(admin.address)).to.equal(toUnits("999000") + platformFee + creatorFee + royaltyFee);
    expect(await token.balanceOf(referrer.address)).to.equal(referrerFee);
  });

  it("directCommission applies creator fee", async () => {
    const { token, user, recipient, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("20");
    const platformFee = amount / 100n;
    const creatorFee = (amount * 50n) / 10000n;

    await expect(token.connect(user).directCommission(recipient.address, amount))
      .to.emit(token, "DirectCommission")
      .withArgs(user.address, recipient.address, amount, amount - platformFee - creatorFee, platformFee, creatorFee);

    expect(await token.balanceOf(recipient.address)).to.equal(amount - platformFee - creatorFee);
    expect(await token.balanceOf(admin.address)).to.equal(
      toUnits("999000") + platformFee + creatorFee
    );
  });

  it("royaltyTransfer funnels royalties", async () => {
    const { token, user, recipient, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("10");
    const platformFee = (amount * 75n) / 10000n;
    const royaltyFee = (amount * 75n) / 10000n;
    const netAmount = amount - platformFee - royaltyFee;

    await expect(token.connect(user).royaltyTransfer(recipient.address, amount))
      .to.emit(token, "RoyaltyPaid")
      .withArgs(user.address, recipient.address, amount, netAmount, platformFee, royaltyFee);

    expect(await token.balanceOf(recipient.address)).to.equal(netAmount);
    expect(await token.balanceOf(admin.address)).to.equal(toUnits("999000") + platformFee + royaltyFee);
  });

  it("superRoyaltyTransfer splits among payees and handles dust", async () => {
    const { token, user, recipient, payee1, payee2, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("50");
    const platformFee = (amount * 75n) / 10000n;
    const creatorFee = (amount * 25n) / 10000n;
    const royaltyFee = (amount * 50n) / 10000n;

    const netAmount = amount - platformFee - creatorFee - royaltyFee;

    const payees = [payee1.address, payee2.address];
    const splits = [6000, 3000]; // 90%, remainder should go to recipient

    const expectedPayee1 = (netAmount * BigInt(splits[0])) / 10000n;
    const expectedPayee2 = (netAmount * BigInt(splits[1])) / 10000n;
    const expectedRecipient = netAmount - expectedPayee1 - expectedPayee2;

    await expect(
      token.connect(user).superRoyaltyTransfer(recipient.address, amount, payees, splits)
    )
      .to.emit(token, "SuperRoyaltyPaid")
      .withArgs(
        user.address,
        recipient.address,
        amount,
        netAmount,
        platformFee,
        royaltyFee,
        payees,
        [expectedPayee1, expectedPayee2]
      );

    expect(await token.balanceOf(payee1.address)).to.equal(expectedPayee1);
    expect(await token.balanceOf(payee2.address)).to.equal(expectedPayee2);
    expect(await token.balanceOf(recipient.address)).to.equal(expectedRecipient);
    expect(await token.balanceOf(admin.address)).to.equal(
      toUnits("999000") + platformFee + creatorFee + royaltyFee
    );
  });

  it("creatorTransfer sends creator fees", async () => {
    const { token, user, recipient, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("30");
    const platformFee = (amount * 50n) / 10000n;
    const creatorFee = (amount * 50n) / 10000n;

    await expect(token.connect(user).creatorTransfer(recipient.address, amount))
      .to.emit(token, "CreatorPaid")
      .withArgs(
        user.address,
        recipient.address,
        amount,
        amount - platformFee - creatorFee,
        platformFee,
        creatorFee
      );

    expect(await token.balanceOf(recipient.address)).to.equal(amount - platformFee - creatorFee);
    expect(await token.balanceOf(admin.address)).to.equal(toUnits("999000") + platformFee + creatorFee);
  });

  it("flashTransfer requires role and charges platform fee", async () => {
    const { token, user, flashOperator, recipient, admin } = await loadFixture(deployTokenFixture);
    const amount = toUnits("40");
    await token.transfer(flashOperator.address, amount);

    const adminBalanceBefore = await token.balanceOf(admin.address);

    await expect(token.connect(user).flashTransfer(recipient.address, amount)).to.be.revertedWith(
      "Missing flash role"
    );

    const platformFee = (amount * 25n) / 10000n;
    const netAmount = amount - platformFee;

    await expect(token.connect(flashOperator).flashTransfer(recipient.address, amount))
      .to.emit(token, "FlashTransfer")
      .withArgs(flashOperator.address, recipient.address, amount, netAmount, platformFee);

    expect(await token.balanceOf(recipient.address)).to.equal(netAmount);
    expect(await token.balanceOf(admin.address)).to.equal(adminBalanceBefore + platformFee);
  });

  it("blocks transfers when paused", async () => {
    const { token, admin, user, recipient } = await loadFixture(deployTokenFixture);
    await token.connect(admin).pause();
    await expect(token.connect(user).slotBuy(recipient.address, toUnits("1"), ethers.ZeroAddress)).to.be.revertedWithCustomError(
      token,
      "EnforcedPause"
    );
    await token.connect(admin).unpause();
    await expect(
      token.connect(user).slotBuy(recipient.address, toUnits("1"), ethers.ZeroAddress)
    ).to.emit(token, "SlotBuy");
  });

  it("rejects zero address parameters", async () => {
    const { token, user } = await loadFixture(deployTokenFixture);
    await expect(token.connect(user).slotBuy(ethers.ZeroAddress, toUnits("1"), ethers.ZeroAddress)).to.be.revertedWith(
      "Recipient is zero"
    );
    await expect(token.setFeeWallets(ethers.ZeroAddress, user.address, user.address)).to.be.revertedWith(
      "Platform wallet is zero"
    );
  });

  it("rejects payee bps overflow in superRoyaltyTransfer", async () => {
    const { token, user, recipient, payee1, payee2 } = await loadFixture(deployTokenFixture);
    await expect(
      token
        .connect(user)
        .superRoyaltyTransfer(recipient.address, toUnits("1"), [payee1.address, payee2.address], [9000, 2000])
    ).to.be.revertedWith("Payee bps overflow");
  });

  it("allows admin mint/burn and prevents others", async () => {
    const { token, admin, user, recipient } = await loadFixture(deployTokenFixture);
    await expect(token.connect(admin).mint(recipient.address, toUnits("5"))).to.emit(token, "Transfer");
    expect(await token.balanceOf(recipient.address)).to.equal(toUnits("5"));
    await expect(token.connect(user).mint(recipient.address, toUnits("1"))).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );

    await expect(token.connect(admin).burnFrom(recipient.address, toUnits("2"))).to.emit(token, "Transfer");
    expect(await token.balanceOf(recipient.address)).to.equal(toUnits("3"));
  });
});
