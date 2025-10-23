import { Router } from "express";
import { gainDistributorService } from "../services/gainDistributorService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ethereumAddressSchema } from "../schemas.js";
import { HttpError } from "../lib/httpError.js";
import { serializeBigInt } from "../utils/serialize.js";

export const tokenRouter = Router();

tokenRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const summary = await gainDistributorService.getSummary();
    res.json({
      status: "ok",
      chain: summary.chain,
      usdtToken: summary.usdtToken
    });
  })
);

tokenRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const summary = await gainDistributorService.getSummary();
    res.json(serializeBigInt(summary));
  })
);

tokenRouter.get(
  "/user/:address",
  asyncHandler(async (req, res) => {
    const parseResult = ethereumAddressSchema.safeParse(req.params.address);
    if (!parseResult.success) {
      throw new HttpError(400, parseResult.error.issues[0]?.message ?? "Invalid address");
    }
    const profile = await gainDistributorService.getUserProfile(parseResult.data);
    res.json(serializeBigInt(profile));
  })
);
