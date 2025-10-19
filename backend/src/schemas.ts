import { z } from "zod";

export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");

export const amountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Amount must be a positive decimal string");

export const feeTypeSchema = z.enum([
  "slotBuy",
  "directCommission",
  "royaltyTransfer",
  "superRoyaltyTransfer",
  "creatorTransfer",
  "flashTransfer"
]);

const feeConfigSchema = z
  .object({
    platformFeeBps: z.number().int().nonnegative(),
    creatorFeeBps: z.number().int().nonnegative(),
    royaltyFeeBps: z.number().int().nonnegative(),
    referrerFeeBps: z.number().int().nonnegative()
  })
  .refine(
    (data) => data.platformFeeBps + data.creatorFeeBps + data.royaltyFeeBps + data.referrerFeeBps <= 1000,
    "Combined fees must be <= 1000 bps"
  )
  .refine(
    (data) =>
      data.platformFeeBps <= 1000 &&
      data.creatorFeeBps <= 1000 &&
      data.royaltyFeeBps <= 1000 &&
      data.referrerFeeBps <= 1000,
    "Each fee must be <= 1000 bps"
  );

export const setFeesSchema = z.object({
  feeType: feeTypeSchema,
  config: feeConfigSchema
});

export const setFeeWalletsSchema = z.object({
  platformWallet: ethereumAddressSchema,
  creatorWallet: ethereumAddressSchema,
  royaltyWallet: ethereumAddressSchema
});

export const slotBuySchema = z.object({
  recipient: ethereumAddressSchema,
  amount: amountSchema,
  referrer: ethereumAddressSchema.optional().default("0x0000000000000000000000000000000000000000")
});

export const directCommissionSchema = z.object({
  seller: ethereumAddressSchema,
  amount: amountSchema
});

export const royaltyTransferSchema = z.object({
  recipient: ethereumAddressSchema,
  amount: amountSchema
});

export const superRoyaltyTransferSchema = z
  .object({
    recipient: ethereumAddressSchema,
    amount: amountSchema,
    payees: z.array(ethereumAddressSchema),
    bps: z.array(z.number().int().nonnegative())
  })
  .refine((data) => data.payees.length === data.bps.length, "payees and bps must have same length")
  .refine(
    (data) => data.bps.reduce((acc, cur) => acc + cur, 0) <= 10000,
    "Sum of payee bps must be <= 10000"
  );

export const creatorTransferSchema = z.object({
  recipient: ethereumAddressSchema,
  amount: amountSchema
});

export const flashTransferSchema = z.object({
  to: ethereumAddressSchema,
  amount: amountSchema
});
