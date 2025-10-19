import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("4000"),
  RPC_URL: z.string().url("RPC_URL must be a valid URL"),
  PRIVATE_KEY_BACKEND_SIGNER: z.string().min(64, "PRIVATE_KEY_BACKEND_SIGNER is required"),
  API_KEY_ADMIN: z.string().min(1, "API_KEY_ADMIN is required"),
  CHAIN_ID: z.coerce.number().int().positive("CHAIN_ID must be a positive integer")
});

const env = envSchema.parse(process.env);

export const config = {
  port: Number(env.PORT),
  rpcUrl: env.RPC_URL,
  backendPrivateKey: env.PRIVATE_KEY_BACKEND_SIGNER,
  apiKeyAdmin: env.API_KEY_ADMIN,
  chainId: env.CHAIN_ID
} as const;
