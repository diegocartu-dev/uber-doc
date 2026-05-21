import {
  generarParRSA,
  encriptarClavePrivada,
  desencriptarClavePrivada,
  hashSHA256,
  firmar,
  verificar,
} from "../../src/lib/firma/crypto";
import { randomBytes } from "crypto";

// Set test master key
process.env.FIRMA_MASTER_KEY = randomBytes(32).toString("hex");

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Test 1: Generación de par RSA
const { publicKey, privateKey } = generarParRSA();
assert(publicKey.includes("BEGIN PUBLIC KEY"), "publicKey es PEM");
assert(privateKey.includes("BEGIN PRIVATE KEY"), "privateKey es PEM");

// Test 2: Encriptar y desencriptar clave privada
const encrypted = encriptarClavePrivada(privateKey);
assert(typeof encrypted === "string" && encrypted.length > 0, "encriptado no vacío");
const decrypted = desencriptarClavePrivada(encrypted);
assert(decrypted === privateKey, "desencriptar devuelve la clave original");

// Test 3: Hash SHA-256
const hash1 = hashSHA256("test data");
const hash2 = hashSHA256("test data");
const hash3 = hashSHA256("different data");
assert(hash1 === hash2, "hash determinístico");
assert(hash1 !== hash3, "hash diferente para datos diferentes");
assert(hash1.length === 64, "hash tiene 64 hex chars");

// Test 4: Firmar y verificar
const data = "contenido de receta";
const hash = hashSHA256(data);
const signature = firmar(hash, privateKey);
assert(typeof signature === "string" && signature.length > 0, "firma no vacía");

const valid = verificar(hash, signature, publicKey);
assert(valid === true, "firma válida con clave correcta");

// Test 5: Firma inválida con datos alterados
const tamperedHash = hashSHA256("datos alterados");
const invalidVerify = verificar(tamperedHash, signature, publicKey);
assert(invalidVerify === false, "firma inválida con datos alterados");

// Test 6: Firma inválida con otra clave
const { publicKey: otherPub } = generarParRSA();
const wrongKey = verificar(hash, signature, otherPub);
assert(wrongKey === false, "firma inválida con clave incorrecta");

// Test 7: Encriptar con key diferente no desencripta
const originalKey = process.env.FIRMA_MASTER_KEY;
const enc = encriptarClavePrivada("secret");
process.env.FIRMA_MASTER_KEY = randomBytes(32).toString("hex");
try {
  desencriptarClavePrivada(enc);
  assert(false, "debería fallar con key diferente");
} catch {
  assert(true, "falla con key diferente");
}
process.env.FIRMA_MASTER_KEY = originalKey;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
