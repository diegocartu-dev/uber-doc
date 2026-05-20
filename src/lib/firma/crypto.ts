import {
  generateKeyPairSync,
  createSign,
  createVerify,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const hex = process.env.FIRMA_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("FIRMA_MASTER_KEY inválida o ausente (debe ser 64 hex chars)");
  }
  return Buffer.from(hex, "hex");
}

export function generarParRSA(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function encriptarClavePrivada(privateKey: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function desencriptarClavePrivada(ciphertext: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function hashSHA256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function firmar(data: string, privateKeyPem: string): string {
  const sign = createSign("RSA-SHA256");
  sign.update(data, "utf8");
  sign.end();
  return sign.sign(privateKeyPem, "base64");
}

export function verificar(
  data: string,
  signature: string,
  publicKeyPem: string
): boolean {
  const verify = createVerify("RSA-SHA256");
  verify.update(data, "utf8");
  verify.end();
  return verify.verify(publicKeyPem, signature, "base64");
}
