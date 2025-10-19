import { z } from "zod";

export const deploymentArtifactsSchema = z.object({
  chain: z.string(),
  addresses: z.record(z.string()),
  abis: z.record(z.any()),
  updatedAt: z.string().datetime()
});
