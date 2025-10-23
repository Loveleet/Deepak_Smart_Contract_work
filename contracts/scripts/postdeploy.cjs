const fs = require("fs/promises");
const path = require("path");

(async () => {
  try {
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

    console.log(`Artifacts exported to:\n- ${frontendTarget}\n- ${backendTarget}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
