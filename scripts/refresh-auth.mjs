import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkedProject = resolve(
  process.argv[2] || root,
);
const scope = "vercel-internal-playground";

if (!existsSync(join(linkedProject, ".vercel", "project.json"))) {
  console.error(
    "An existing linked Internal Playground project is required. Pass its directory: npm run auth:refresh -- /path/to/project. Alternatively, set AI_GATEWAY_API_KEY in .env.local.",
  );
  process.exit(1);
}

function vercel(args) {
  const result = spawnSync("vercel", args, {
    cwd: linkedProject,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      "Vercel could not refresh authentication. Complete any required login, then retry.",
    );
}

let temp;
try {
  vercel(["project", "inspect", "--scope", scope, "--non-interactive"]);
  temp = mkdtempSync(join(tmpdir(), "decision-lab-auth-"));
  const target = join(temp, "development.env");
  vercel([
    "env",
    "pull",
    target,
    "--environment",
    "development",
    "--scope",
    scope,
    "--non-interactive",
  ]);
  const token = readFileSync(target, "utf8")
    .split("\n")
    .find((line) => line.startsWith("VERCEL_OIDC_TOKEN="));
  if (!token)
    throw new Error("The linked project did not return a Vercel OIDC token.");
  const envPath = join(root, ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const otherLines = existing
    .split("\n")
    .filter((line) => !line.startsWith("VERCEL_OIDC_TOKEN="))
    .join("\n")
    .trimEnd();
  writeFileSync(envPath, `${otherLines}${otherLines ? "\n" : ""}${token}\n`, {
    mode: 0o600,
  });
  console.log(
    "Refreshed the server-only OIDC token. Restart the app to use it. No Gateway key or team policy was changed.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Authentication refresh failed.",
  );
  process.exitCode = 1;
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
