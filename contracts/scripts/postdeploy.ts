import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  const raw = await fs.readFile(artifactsPath, "utf8");

  const artifacts = JSON.parse(raw);

  const frontendDir = path.resolve(__dirname, "../../frontend/src/generated");
  const backendDir = path.resolve(__dirname, "../../backend/src/generated");

  await fs.mkdir(frontendDir, { recursive: true });
  await fs.mkdir(backendDir, { recursive: true });

  const frontendTarget = path.join(frontendDir, "artifacts.json");
  const backendTarget = path.join(backendDir, "artifacts.json");

  await Promise.all([
    fs.writeFile(frontendTarget, JSON.stringify(artifacts, null, 2)),
    fs.writeFile(backendTarget, JSON.stringify(artifacts, null, 2))
  ]);

  console.log(`Artifacts exported to:
- ${frontendTarget}
- ${backendTarget}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
