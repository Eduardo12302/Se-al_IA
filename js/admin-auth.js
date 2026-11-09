
const SALT_HEX = "f65abb7d27d081da2e5b420bb300fe75";
const PASSWORD_HASH_HEX = "cf3461046111e8507eed890c1529f72fe6b515de8c1a365c239b788fa9503d79";
const ITERATIONS = 200000;

function fromHex(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

export async function verifyAdminPassword(password) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("La verificación segura requiere abrir la aplicación en localhost o HTTPS.");
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(SALT_HEX), iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const candidate = new Uint8Array(derived);
  const expected = fromHex(PASSWORD_HASH_HEX);
  let difference = candidate.length ^ expected.length;
  for (let i = 0; i < Math.min(candidate.length, expected.length); i++) difference |= candidate[i] ^ expected[i];
  return difference === 0;
}
