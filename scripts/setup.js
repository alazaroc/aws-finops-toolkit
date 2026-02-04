const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const lambdasDir = path.join(rootDir, "src", "lambdas");
const npmCmd = "npm";

function runNpmInstall(cwd) {
    console.log(`\n[setup] npm install in: ${cwd}`);
    const result = spawnSync(
        npmCmd,
        ["install", "--loglevel=warn", "--progress=false", "--no-audit", "--no-fund"],
        {
            cwd,
            stdio: "inherit",
            shell: true
        }
    );

    if (result.error) {
        console.error(`[setup] Failed to run npm install in: ${cwd}`);
        console.error(result.error);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }

}

runNpmInstall(rootDir);

if (fs.existsSync(lambdasDir)) {
    const entries = fs.readdirSync(lambdasDir, { withFileTypes: true });
    const lambdaDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(lambdasDir, entry.name))
        .filter((dir) => fs.existsSync(path.join(dir, "package.json")));

    for (const lambdaDir of lambdaDirs) {
        runNpmInstall(lambdaDir);
    }
}
