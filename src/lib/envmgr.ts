import fs from "fs";

const ENV_FILE = ".env";

/**
 * @description Environment Manager for managing environment variables in a .env file.
 */
export const EnvironmentManager = {
  get(key: string): string | undefined {
    if (!fs.existsSync(ENV_FILE)) return undefined;

    const data = fs.readFileSync(ENV_FILE, "utf-8");
    const lines = data.split("\n");
    for (const line of lines) {
      if (line.trim().startsWith("#")) continue;
      const [k, ...rest] = line.split("=");
      if (!k) continue;
      if (k.trim() === key.trim()) {
        let value = rest.join("=");
        // Remove surrounding quotes if present
        value = value.replace(/^(['"])(.+)\1$/, "$2");
        return value.trim();
      }
    }
    return undefined;
  },

  set(key: string, value: string) {
    let data = "";
    key = key.trim();
    value = value.trim();
    if (fs.existsSync(ENV_FILE)) {
      data = fs.readFileSync(ENV_FILE, "utf-8");
      const lines = data.split("\n");
      let found = false;
      for (let line of lines) {
        if (line.trim().startsWith("#") || !line.trim()) continue;
        const [k] = line.split("=");
        if (!k) continue;
        if (k.trim() === key.trim()) {
          line = `${key.trim()}="${value}"`;
          found = true;
          break;
        }
      }
      if (!found) {
        lines.push(`${key.trim()}="${value}"`);
      }
      data = lines.join("\n");
    } else {
      data = `${key.trim()}="${value}"`;
    }
    fs.writeFileSync(ENV_FILE, data, "utf-8");
    console.withSender("ENVM").debug(`Set environment variable: ${key}=${value}`);
  },

  delete(...keys: string[]) {
    if (!fs.existsSync(ENV_FILE)) return;

    let data = fs.readFileSync(ENV_FILE, "utf-8");
    const lines = data.split("\n");
    const newLines = lines.filter((line) => {
      if (line.trim().startsWith("#") || !line.trim()) return true;
      const [k] = line.split("=");
      if (!k) return true;
      return !keys.includes(k.trim());
    });
    data = newLines.join("\n");
    fs.writeFileSync(ENV_FILE, data, "utf-8");
    console.withSender("ENVM").debug(`Deleted environment variables: ${keys.join(", ")}`)
  },

  clear() {
    if (fs.existsSync(ENV_FILE)) {
      fs.unlinkSync(ENV_FILE);
      console.withSender("ENVM").debug("Cleared all environment variables.");
    }
  },
};
