import crypto from "crypto";
import { fileURLToPath } from "url";
import { IEM } from "./iem";

const algorithm = "aes-256-gcm";
let key: string;

export function encrypt(text: string): string {
  if (!key) key = global.encryptionKey ?? IEM.get("ENCRYPTION_KEY")!;

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(data: string): string {
  if (!key) key = global.encryptionKey ?? IEM.get("ENCRYPTION_KEY")!;

  const buffer = Buffer.from(data, "base64");

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

const directRun = process.argv[1] === fileURLToPath(import.meta.url);

if (directRun) {
  // get first argument after the script name
  const action = process.argv[2] as "encrypt" | "decrypt" | "vk";
  const input = process.argv[3];

  if (!action || (action != "vk" && !input)) {
    console.error("Usage: node encryption.js <encrypt|decrypt|vk> [input]");
    process.exit(1);
  }

  try {
    if (action === "encrypt") {
      const encrypted = encrypt(input!);
      console.log(encrypted);
    } else if (action === "decrypt") {
      const decrypted = decrypt(input!);
      console.log(decrypted);
    } else if (action === "vk") {
      console.log(global.encryptionKey ?? IEM.get("ENCRYPTION_KEY")!);
    } else {
      console.error("Invalid action. Use 'encrypt', 'decrypt', or 'vk'.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
