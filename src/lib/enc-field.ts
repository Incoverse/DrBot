import { decrypt, encrypt } from "./encryption";

export class EncryptedField<T = string> {
  private encrypted: string | null = null;

  constructor(value?: T | string) {
    if (typeof value === "string" && this.isEncrypted(value)) {
      this.encrypted = value;
    } else if (value !== undefined && value !== null) {
      this.set(value as T);
    }
  }

  private isEncrypted(value: string) {
    try {
      decrypt(value);
      return true;
    } catch {
      return false;
    }
  }

  set(value: T) {
    const str = JSON.stringify(value);
    this.encrypted = encrypt(str);
  }

  get(): T | null {
    if (!this.encrypted) return null;
      
    try {
      const decrypted = decrypt(this.encrypted);
      return JSON.parse(decrypted);
    } catch (e) {
      console.error("An error occurred while retrieving an EncryptedField value.", e);
      return null;
    }
  }

  validate() {
    if (!this.encrypted) return true;
    try {
      const decrypted = decrypt(this.encrypted);
      JSON.parse(decrypted);
      return true;
    } catch (e) {
      console.error("An error occurred while validating an EncryptedField. The value may be corrupted or the encryption key may have changed.", e);
      return false;
    }
  }
  isSet() {
    return !!this.encrypted;
  }

  isEmpty() {
    return !this.encrypted;
  }

  toDB() {
    return this.encrypted;
  }

  static fromDB<T>(value: string) {
    const field = new EncryptedField<T>();
    field.encrypted = value;
    return field;
  }

  toString() {
    return this.encrypted;
  }
}
