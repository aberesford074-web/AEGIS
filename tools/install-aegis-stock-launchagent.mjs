import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const label = "com.aegis.salesos.stockserver";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aegisRoot = path.resolve(__dirname, "..");
const nodePath = process.execPath;
const serverPath = path.join(aegisRoot, "tools", "aegis-sales-os-stock-server.mjs");
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const logsDir = path.join(os.homedir(), "Library", "Logs", "AEGIS");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const uid = execFileSync("id", ["-u"], { encoding: "utf8" }).trim();
const domain = `gui/${uid}`;

function xml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(serverPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(aegisRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>4195</string>
    <key>FORKLIFT_SITE_DIR</key>
    <string>${xml(path.join(aegisRoot, "Forklift Pro Solutions"))}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(path.join(logsDir, "stock-server.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(path.join(logsDir, "stock-server.err.log"))}</string>
</dict>
</plist>
`;

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(logsDir, { recursive: true });
await writeFile(plistPath, plist);

spawnSync("launchctl", ["bootout", domain, plistPath], { stdio: "ignore" });

const bootstrap = spawnSync("launchctl", ["bootstrap", domain, plistPath], {
  encoding: "utf8",
});

if (bootstrap.status !== 0) {
  process.stderr.write(bootstrap.stderr || bootstrap.stdout || "launchctl bootstrap failed\n");
  process.exit(bootstrap.status || 1);
}

const kickstart = spawnSync("launchctl", ["kickstart", "-k", `${domain}/${label}`], {
  encoding: "utf8",
});

if (kickstart.status !== 0) {
  process.stderr.write(kickstart.stderr || kickstart.stdout || "launchctl kickstart failed\n");
  process.exit(kickstart.status || 1);
}

console.log(JSON.stringify({
  ok: true,
  label,
  plistPath,
  nodePath,
  serverPath,
  url: "http://127.0.0.1:4195",
  logs: {
    stdout: path.join(logsDir, "stock-server.out.log"),
    stderr: path.join(logsDir, "stock-server.err.log"),
  },
}, null, 2));
