import { promises as fs } from "node:fs";
import path from "node:path";
import { deploymentArtifactsSchema, type DeploymentArtifacts } from "@lab/shared";

let cache: DeploymentArtifacts | null = null;

const resolveArtifactsPath = () => {
  const override = process.env.ARTIFACTS_PATH;
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "../shared/artifacts.json");
};

export const loadArtifacts = async (): Promise<DeploymentArtifacts> => {
  if (cache) {
    return cache;
  }

  const filePath = resolveArtifactsPath();
  const contents = await fs.readFile(filePath, "utf8");
  const parsed = deploymentArtifactsSchema.parse(JSON.parse(contents));
  cache = parsed;
  return parsed;
};

export const clearArtifactsCache = () => {
  cache = null;
};
