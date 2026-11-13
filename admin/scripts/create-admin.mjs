// Create (or reset) the single admin user (spec §2.4). Env-driven so the
// password never lands in a file or a shell history inside the repo:
//   ADMIN_USERNAME=terrell ADMIN_PASSWORD=... npm run create-admin
// Optional: ADMIN_TOTP_SECRET (base32). If absent, one is generated and
// printed ONCE below together with the otpauth URL and 10 recovery codes —
// store them somewhere safe; they are never shown again.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const username = process.env.ADMIN_USERNAME ?? "terrell";
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD is not set — refusing to invent a password");
  process.exit(1);
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function encryptSecret(plaintext) {
  const keyMaterial = process.env.TOTP_ENC_KEY;
  if (!keyMaterial) throw new Error("TOTP_ENC_KEY is not set");
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

const totpSecret = process.env.ADMIN_TOTP_SECRET ?? b32(randomBytes(20));
const recoveryCodes = Array.from({ length: 10 }, () =>
  randomBytes(5).toString("hex").toUpperCase()
);
const recoveryHashes = recoveryCodes.map((c) =>
  createHash("sha256").update(c).digest("hex")
);
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    `INSERT INTO admin_users (id, username, password_hash, totp_secret_enc, recovery_code_hashes)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       totp_secret_enc = EXCLUDED.totp_secret_enc,
       recovery_code_hashes = EXCLUDED.recovery_code_hashes`,
    [username, passwordHash, encryptSecret(totpSecret), JSON.stringify(recoveryHashes)]
  );
} finally {
  await client.end();
}

console.log(`Admin user ready: ${username}`);
console.log(`TOTP secret (shown once): ${totpSecret}`);
console.log(
  `otpauth URL: otpauth://totp/FabricAdmin:${encodeURIComponent(username)}?secret=${totpSecret}&issuer=FabricAdmin`
);
console.log("Recovery codes (shown once):");
for (const c of recoveryCodes) console.log("  " + c);
