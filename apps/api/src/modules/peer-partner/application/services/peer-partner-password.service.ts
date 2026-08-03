import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

@Injectable()
export class PeerPartnerPasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;

    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const storedBuf = Buffer.from(hashHex, "hex");
    return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf);
  }
}
