import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Request, Response } from "express";

const gainDistributorServiceMock = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getUserProfile: vi.fn()
}));

vi.mock("../src/services/gainDistributorService.js", () => ({
  gainDistributorService: gainDistributorServiceMock
}));

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.js"));
});

const runRequest = async (
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>
) => {
  const app = createApp();

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );

  const req = Object.assign(Object.create(express.request), {
    method,
    url,
    headers: normalizedHeaders,
    body: body ?? {},
    query: {},
    params: {},
    socket: { remoteAddress: "127.0.0.1" }
  }) as Request;

  const res = Object.assign(Object.create(express.response), {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
       this.end();
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
       this.end();
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete this.headers[name.toLowerCase()];
    },
    end(this: Response & { body: unknown }, chunk?: unknown) {
      if (chunk !== undefined) {
        this.body = chunk;
      }
      this.emit("finish");
      return this;
    }
  }) as Response & { body: unknown };

  await new Promise<void>((resolve, reject) => {
    res.on("finish", () => resolve());
    res.on("end", () => resolve());
    app.handle(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return res;
};

const summaryMock = {
  chain: "bscTestnet",
  contract: { address: "0x123", abi: [] },
  usdtToken: "0xabc",
  tokenDecimals: 6,
  creatorWallet: "0x0000000000000000000000000000000000000001",
  flashWallet: "0x0000000000000000000000000000000000000002",
  slotPrices: ["25", "50"],
  royaltyBps: { 5: 500 }
};

describe("GAIN distributor routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gainDistributorServiceMock.getSummary.mockResolvedValue(summaryMock);
    gainDistributorServiceMock.getUserProfile.mockResolvedValue({
      address: "0x0000000000000000000000000000000000000003",
      referrer: "0x0000000000000000000000000000000000000004",
      maxSlot: 5,
      registeredAllowance: { allowance: "100", blockNum: 12 },
      qualifiedDirects: [{ level: 1, count: 4 }]
    });
  });

  it("returns health status", async () => {
    const res = await runRequest("GET", "/health");
    expect(res.statusCode).toBe(200);
    expect((res as any).body.status).toBe("ok");
    expect(gainDistributorServiceMock.getSummary).toHaveBeenCalledOnce();
  });

  it("returns config payload", async () => {
    const res = await runRequest("GET", "/config");
    expect(res.statusCode).toBe(200);
    expect((res as any).body.contract.address).toBe("0x123");
  });

  it("validates user profile address", async () => {
    const bad = await runRequest("GET", "/user/not-an-address");
    expect(bad.statusCode).toBe(400);

    const ok = await runRequest("GET", "/user/0x0000000000000000000000000000000000000003");
    expect(ok.statusCode).toBe(200);
    expect(gainDistributorServiceMock.getUserProfile).toHaveBeenCalledWith("0x0000000000000000000000000000000000000003");
  });
});
