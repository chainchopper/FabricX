import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

// ---------------------------------------------------------------------------
// Config signing. The build brief for Admin-1 directs HMAC-SHA256 with
// CONFIG_SIGNING_SECRET (the spec's §2.3 text names Ed25519; the payload
// contract — versioned, signed, bad signature = ignored — is identical, and
// the secret lives only on the admin host either way). Recorded in
// BUILD-REPORT.md as a deliberate, brief-directed deviation.
// ---------------------------------------------------------------------------

export function signConfig(payloadWithoutSignature: unknown): string {
  const secret = process.env.CONFIG_SIGNING_SECRET;
  if (!secret) throw new Error("CONFIG_SIGNING_SECRET is not set");
  const body = JSON.stringify(payloadWithoutSignature);
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyConfigSignature(
  payloadWithoutSignature: unknown,
  signature: string
): boolean {
  const expected = signConfig(payloadWithoutSignature);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// TOTP secret encryption at rest (§2.4): AES-256-GCM, key derived from
// TOTP_ENC_KEY env. Stored format: v1.<iv b64>.<tag b64>.<ciphertext b64>
// ---------------------------------------------------------------------------

function totpEncKey(): Buffer {
  const k = process.env.TOTP_ENC_KEY;
  if (!k) throw new Error("TOTP_ENC_KEY is not set");
  return createHash("sha256").update(k).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", totpEncKey(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("unrecognized encrypted secret format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    totpEncKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Hash a recovery code / token for storage (sha256 is fine for high-entropy codes). */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
