import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";

type RuntimeIdentityContext = "docker" | "host" | "fallback";

export type RuntimeIdentity = {
  id: string;
  source: string;
  context: RuntimeIdentityContext;
  trusted: boolean;
};

function readTextIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, "utf-8").trim();
}

function normalizeToken(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
}

function hashIdentity(source: string, rawValue: string) {
  const normalizedRaw = normalizeToken(rawValue);
  const digest = crypto
    .createHash("sha256")
    .update(`${source}:${normalizedRaw}`)
    .digest("hex");

  return `${source}:${digest}`;
}

function runCommand(command: string) {
  try {
    return execSync(command, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return undefined;
  }
}

function extractContainerIdFromCGroup(cgroupText?: string) {
  if (!cgroupText) return undefined;

  const patterns = [
    /docker[-\/]([0-9a-f]{12,64})(?:\.scope)?/i,
    /containerd[-\/]([0-9a-f]{12,64})(?:\.scope)?/i,
    /libpod[-\/]([0-9a-f]{12,64})(?:\.scope)?/i,
    /(?:^|\/)([0-9a-f]{64})(?:\.scope)?$/im,
    /(?:^|\/)([0-9a-f]{32,64})(?:\.scope)?$/im,
  ];

  for (const pattern of patterns) {
    const match = cgroupText.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  return undefined;
}

function isDockerRuntime() {
  if (process.platform !== "linux") return false;
  if (fs.existsSync("/.dockerenv")) return true;

  const cgroupText =
    readTextIfExists("/proc/1/cgroup") ?? readTextIfExists("/proc/self/cgroup");

  if (!cgroupText) return false;
  return /(docker|containerd|kubepods|podman|libpod)/i.test(cgroupText);
}

function resolveDockerRuntimeIdentity(): RuntimeIdentity | null {
  const cgroupText =
    readTextIfExists("/proc/self/cgroup") ?? readTextIfExists("/proc/1/cgroup");

  const cgroupId = extractContainerIdFromCGroup(cgroupText);
  if (cgroupId) {
    return {
      id: hashIdentity("docker.cgroup", cgroupId),
      source: "docker.cgroup",
      context: "docker",
      trusted: true,
    };
  }

  const hostname = readTextIfExists("/etc/hostname");
  if (hostname && /^[0-9a-z][0-9a-z_.-]{5,}$/i.test(hostname)) {
    return {
      id: hashIdentity("docker.hostname", hostname),
      source: "docker.hostname",
      context: "docker",
      trusted: true,
    };
  }

  return null;
}

function resolveWindowsMachineIdentity(): RuntimeIdentity | null {
  const output = runCommand(
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
  );

  if (!output) return null;

  const match = output.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
  const machineGuid = match?.[1]?.trim();
  if (!machineGuid) return null;

  return {
    id: hashIdentity("host.windows.machineguid", machineGuid),
    source: "host.windows.machineguid",
    context: "host",
    trusted: true,
  };
}

function resolveLinuxMachineIdentity(): RuntimeIdentity | null {
  const machineId =
    readTextIfExists("/etc/machine-id") ??
    readTextIfExists("/var/lib/dbus/machine-id");

  if (!machineId) return null;

  return {
    id: hashIdentity("host.linux.machine-id", machineId),
    source: "host.linux.machine-id",
    context: "host",
    trusted: true,
  };
}

function resolveMacMachineIdentity(): RuntimeIdentity | null {
  const output = runCommand(
    "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3; }'",
  );

  const machineId = output?.replaceAll('"', "").trim();
  if (!machineId) return null;

  return {
    id: hashIdentity("host.macos.ioplatformuuid", machineId),
    source: "host.macos.ioplatformuuid",
    context: "host",
    trusted: true,
  };
}

export function resolveTrustedRuntimeIdentity(): RuntimeIdentity {
  if (isDockerRuntime()) {
    const dockerIdentity = resolveDockerRuntimeIdentity();
    if (dockerIdentity) return dockerIdentity;
  }

  if (process.platform === "win32") {
    const machineIdentity = resolveWindowsMachineIdentity();
    if (machineIdentity) return machineIdentity;
  }

  if (process.platform === "linux") {
    const machineIdentity = resolveLinuxMachineIdentity();
    if (machineIdentity) return machineIdentity;
  }

  if (process.platform === "darwin") {
    const machineIdentity = resolveMacMachineIdentity();
    if (machineIdentity) return machineIdentity;
  }

  return {
    id: `fallback.generated:${crypto.randomUUID()}`,
    source: "fallback.generated",
    context: "fallback",
    trusted: false,
  };
}
