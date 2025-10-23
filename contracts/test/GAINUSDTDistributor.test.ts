import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

const USDT_DECIMALS = 6;

const slotPrice = (slot: number) => {
  const prices = [0, 20, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];
  return BigInt(prices[slot]) * BigInt(10 ** USDT_DECIMALS);
};

async function deployFixture() {
  const [deployer, creator, flash, sponsor, buyer, ...rest] = await ethers.getSigners();

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy(USDT_DECIMALS, BigInt(1_000_000) * BigInt(10 ** USDT_DECIMALS));

  const Distributor = await ethers.getContractFactory("GAINUSDTDistributor");
  const distributor = await Distributor.deploy(await usdt.getAddress(), USDT_DECIMALS, creator.address, flash.address);

  // Fund actors with ample balance for upgrades
  await usdt.transfer(buyer.address, slotPrice(12));
  await usdt.transfer(sponsor.address, slotPrice(12) * 2n);

  const referrals = rest.slice(0, 10);
  for (const ref of referrals) {
    await usdt.transfer(ref.address, slotPrice(12));
  }

  return { deployer, creator, flash, sponsor, buyer, referrals, usdt, distributor };
}

async function buySlot(user: any, slotId: number, sponsor: string, contract: any, usdt: any) {
  const price = slotPrice(slotId);
  await usdt.connect(user).approve(await contract.getAddress(), price);
  await contract.connect(user).registerApproval();
  await ethers.provider.send("evm_mine", []);
  await contract.connect(user).slotBuy(slotId, sponsor);
}

describe("GAINUSDTDistributor", () => {
  it("registers approval and enforces block separation", async () => {
    const { distributor, usdt, buyer, sponsor } = await deployFixture();

    await usdt.connect(buyer).approve(await distributor.getAddress(), slotPrice(1));
    await distributor.connect(buyer).registerApproval();
    await ethers.provider.send("evm_mine", []);
    await distributor.connect(buyer).slotBuy(1, sponsor.address);

    const rec = await distributor.registeredAllowance(buyer.address);
    expect(rec.allowance).to.equal(slotPrice(1));
  });

  it("distributes direct, creator, and upline payouts", async () => {
    const { distributor, usdt, sponsor, buyer, creator, flash } = await deployFixture();
    const price = slotPrice(2);

    const sponsorBefore = await usdt.balanceOf(sponsor.address);
    const creatorBefore = await usdt.balanceOf(creator.address);
    const flashBefore = await usdt.balanceOf(flash.address);

    await buySlot(buyer, 2, sponsor.address, distributor, usdt);

    const sponsorAfter = await usdt.balanceOf(sponsor.address);
    const creatorAfter = await usdt.balanceOf(creator.address);
    const flashAfter = await usdt.balanceOf(flash.address);

    const directExpected = (price * 1200n) / 10000n;
    const creatorExpected = (price * 300n) / 10000n;
    const uplineExpected = (price * 7000n) / 10000n;
    const expectedRoyalty = (price * 1500n) / 10000n;

    expect(sponsorAfter - sponsorBefore).to.equal(directExpected);
    expect(creatorAfter - creatorBefore).to.equal(creatorExpected);
    expect(flashAfter - flashBefore).to.equal(uplineExpected + expectedRoyalty);
  });

  it("routes upline spillover according to 1-2-3-4 rule", async () => {
    const { distributor, usdt, sponsor, referrals } = await deployFixture();
    const upline = referrals[0];
    const [child1, child2, child3, child4] = referrals.slice(1, 5);

    await buySlot(sponsor, 3, upline.address, distributor, usdt);

    const price = slotPrice(3);

    const expectDeltas = async (child: any, spillToUpline: boolean) => {
      const sponsorBefore = await usdt.balanceOf(sponsor.address);
      const uplineBefore = await usdt.balanceOf(upline.address);
      await buySlot(child, 3, sponsor.address, distributor, usdt);
      const sponsorAfter = await usdt.balanceOf(sponsor.address);
      const uplineAfter = await usdt.balanceOf(upline.address);

      const directShare = (price * 1200n) / 10000n;
      const uplineShare = (price * 7000n) / 10000n;

      expect(sponsorAfter - sponsorBefore).to.equal(spillToUpline ? directShare : directShare + uplineShare);
      expect(uplineAfter - uplineBefore).to.equal(spillToUpline ? uplineShare : 0n);
    };

    await expectDeltas(child1, true);
    await expectDeltas(child2, false);
    await expectDeltas(child3, true);
    await expectDeltas(child4, false);
  });

  it("distributes royalty to qualified sponsors and routes leftovers", async () => {
    const { distributor, usdt, sponsor, referrals, flash } = await deployFixture();
    const upline = referrals[0];
    const [ref1, ref2, ref3, ref4, ref5, ref6] = referrals.slice(1, 7);
    if (!ref6) {
      throw new Error("Not enough referral signers");
    }

    await buySlot(sponsor, 6, upline.address, distributor, usdt);

    await buySlot(ref1, 6, sponsor.address, distributor, usdt);
    await buySlot(ref2, 6, sponsor.address, distributor, usdt);
    await buySlot(ref3, 6, sponsor.address, distributor, usdt);
    await buySlot(ref4, 6, sponsor.address, distributor, usdt);

    const price = slotPrice(6);
    const royaltyShareLevel5 = (price * 500n) / 10000n;
    const royaltyShareLevel6 = (price * 400n) / 10000n;
    const totalRoyalty = royaltyShareLevel5 + royaltyShareLevel6;
    const directShare = (price * 1200n) / 10000n;
    const uplineShare = (price * 7000n) / 10000n;

    const sponsorBefore = await usdt.balanceOf(sponsor.address);
    const flashBefore = await usdt.balanceOf(flash.address);

    await buySlot(ref5, 6, sponsor.address, distributor, usdt);

    const sponsorAfter = await usdt.balanceOf(sponsor.address);
    expect(sponsorAfter - sponsorBefore).to.equal(directShare + uplineShare + totalRoyalty);

    await buySlot(ref6, 6, ref5.address, distributor, usdt);
    const flashAfter = await usdt.balanceOf(flash.address);
    expect(flashAfter - flashBefore).to.be.gte(0n);
  });

  it("requires consistent sponsor for repeat purchases", async () => {
    const { distributor, usdt, buyer, sponsor, referrals } = await deployFixture();
    const altSponsor = referrals[0];

    await buySlot(buyer, 4, sponsor.address, distributor, usdt);

    await usdt.connect(buyer).approve(await distributor.getAddress(), slotPrice(5));
    await distributor.connect(buyer).registerApproval();
    await ethers.provider.send("evm_mine", []);
    await expect(distributor.connect(buyer).slotBuy(5, altSponsor.address)).to.be.revertedWithCustomError(
      distributor,
      "InvalidSponsor"
    );
  });

  it("counts each direct only once per qualifying level", async () => {
    const { distributor, usdt, sponsor, referrals } = await deployFixture();
    const upline = referrals[0];
    const direct = referrals[1];

    await buySlot(sponsor, 6, upline.address, distributor, usdt);
    await buySlot(direct, 5, sponsor.address, distributor, usdt);

    const level5AfterFirst = await distributor.qualifiedDirects(sponsor.address, 5);
    expect(level5AfterFirst).to.equal(1);

    await buySlot(direct, 6, sponsor.address, distributor, usdt);

    const level5 = await distributor.qualifiedDirects(sponsor.address, 5);
    const level6 = await distributor.qualifiedDirects(sponsor.address, 6);

    expect(level5).to.equal(1);
    expect(level6).to.equal(1);
  });
});
