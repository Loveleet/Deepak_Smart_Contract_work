import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const labTokenServiceMock = vi.hoisted(() => ({
  getSummary: vi.fn(),
  balanceOf: vi.fn(),
  setFees: vi.fn(),
  setFeeWallets: vi.fn(),
  slotBuy: vi.fn(),
  directCommission: vi.fn(),
  royaltyTransfer: vi.fn(),
  superRoyaltyTransfer: vi.fn(),
  creatorTransfer: vi.fn(),
  flashTransfer: vi.fn()
}));

vi.mock("../src/services/labTokenService.js", () => ({
  labTokenService: labTokenServiceMock
}));

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.js"));
});

const summaryMock = {
  name: "LAB Token",
  symbol: "LAB",
  decimals: 18,
  totalSupply: "1000",
  contract: {
    address: "0x000000000000000000000000000000000000000a",
    abi: []
  },
  wallets: {
    platformWallet: "0x0000000000000000000000000000000000000001",
    creatorWallet: "0x0000000000000000000000000000000000000002",
    royaltyWallet: "0x0000000000000000000000000000000000000003"
  },
  fees: {
    slotBuy: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 25, referrerFeeBps: 25 }
  }
};

describe("backend routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    labTokenServiceMock.getSummary.mockResolvedValue(summaryMock);
    labTokenServiceMock.balanceOf.mockResolvedValue({
      address: "0x0000000000000000000000000000000000000004",
      balance: "1000000000000000000",
      formatted: "1"
    });
    labTokenServiceMock.slotBuy.mockResolvedValue({ hash: "0x1", blockNumber: 1, events: [] });
    labTokenServiceMock.setFees.mockResolvedValue({ hash: "0x2", blockNumber: 1, events: [] });
  });

  it("returns health status", async () => {
    const app = createApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns config", async () => {
    const app = createApp();
    const response = await request(app).get("/config");
    expect(response.status).toBe(200);
    expect(labTokenServiceMock.getSummary).toHaveBeenCalledOnce();
    expect(response.body.name).toBe("LAB Token");
  });

  it("validates balance address", async () => {
    const app = createApp();
    const response = await request(app).get("/balance/not-an-address");
    expect(response.status).toBe(400);
  });

  it("requires API key for set-fees", async () => {
    const app = createApp();
    const payload = {
      feeType: "slotBuy",
      config: { platformFeeBps: 0, creatorFeeBps: 0, royaltyFeeBps: 0, referrerFeeBps: 0 }
    };
    const unauthorized = await request(app).post("/set-fees").send(payload);
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post("/set-fees")
      .set("X-API-Key", process.env.API_KEY_ADMIN ?? "changeme")
      .send(payload);

    if ((process.env.API_KEY_ADMIN ?? "changeme") === "changeme") {
      expect(authorized.status).toBe(200);
    }
  });

  it("executes slot-buy", async () => {
    const app = createApp();
    const response = await request(app).post("/slot-buy").send({
      recipient: "0x0000000000000000000000000000000000000005",
      amount: "10",
      referrer: "0x0000000000000000000000000000000000000006"
    });
    expect(response.status).toBe(200);
    expect(labTokenServiceMock.slotBuy).toHaveBeenCalledOnce();
  });
});
