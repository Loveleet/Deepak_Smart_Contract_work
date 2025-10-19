import { Router } from "express";
import { labTokenService } from "../services/labTokenService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  creatorTransferSchema,
  directCommissionSchema,
  flashTransferSchema,
  royaltyTransferSchema,
  setFeeWalletsSchema,
  setFeesSchema,
  slotBuySchema,
  superRoyaltyTransferSchema,
  ethereumAddressSchema
} from "../schemas.js";
import { validateBody } from "../middleware/validate.js";
import { requireApiKey } from "../middleware/auth.js";
import { HttpError } from "../lib/httpError.js";
import { serializeBigInt } from "../utils/serialize.js";

export const tokenRouter = Router();

tokenRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const summary = await labTokenService.getSummary();
    res.json({
      status: "ok",
      chain: summary.name,
      totalSupply: summary.totalSupply
    });
  })
);

tokenRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const summary = await labTokenService.getSummary();
    res.json(serializeBigInt(summary));
  })
);

tokenRouter.get(
  "/balance/:address",
  asyncHandler(async (req, res) => {
    const parseResult = ethereumAddressSchema.safeParse(req.params.address);
    if (!parseResult.success) {
      throw new HttpError(400, parseResult.error.issues[0]?.message ?? "Invalid address");
    }
    const balance = await labTokenService.balanceOf(parseResult.data);
    res.json(balance);
  })
);

tokenRouter.post(
  "/set-fees",
  requireApiKey,
  validateBody(setFeesSchema),
  asyncHandler(async (req, res) => {
    const { feeType, config } = req.body;
    const receipt = await labTokenService.setFees(feeType, config);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/set-fee-wallets",
  requireApiKey,
  validateBody(setFeeWalletsSchema),
  asyncHandler(async (req, res) => {
    const { platformWallet, creatorWallet, royaltyWallet } = req.body;
    const receipt = await labTokenService.setFeeWallets(platformWallet, creatorWallet, royaltyWallet);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/slot-buy",
  validateBody(slotBuySchema),
  asyncHandler(async (req, res) => {
    const { recipient, amount, referrer } = req.body;
    const receipt = await labTokenService.slotBuy(recipient, amount, referrer);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/direct-commission",
  validateBody(directCommissionSchema),
  asyncHandler(async (req, res) => {
    const { seller, amount } = req.body;
    const receipt = await labTokenService.directCommission(seller, amount);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/royalty-transfer",
  validateBody(royaltyTransferSchema),
  asyncHandler(async (req, res) => {
    const { recipient, amount } = req.body;
    const receipt = await labTokenService.royaltyTransfer(recipient, amount);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/super-royalty-transfer",
  validateBody(superRoyaltyTransferSchema),
  asyncHandler(async (req, res) => {
    const { recipient, amount, payees, bps } = req.body;
    const receipt = await labTokenService.superRoyaltyTransfer(recipient, amount, payees, bps);
    res.json(serializeBigInt(receipt));
  })
);

tokenRouter.post(
  "/creator-transfer",
  validateBody(creatorTransferSchema),
  asyncHandler(async (req, res) => {
    const { recipient, amount } = req.body;
    const receipt = await labTokenService.creatorTransfer(recipient, amount);
    res.json(receipt);
  })
);

tokenRouter.post(
  "/flash-transfer",
  requireApiKey,
  validateBody(flashTransferSchema),
  asyncHandler(async (req, res) => {
    const { to, amount } = req.body;
    const receipt = await labTokenService.flashTransfer(to, amount);
    res.json(receipt);
  })
);
