"""Genera un nuevo hash PBKDF2 para cambiar la contraseña local del modo docente.
Ejecutar desde la carpeta raíz del proyecto: python tools/generar_clave_admin.py
"""
from pathlib import Path
import getpass
import hashlib
import secrets

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "js" / "admin-auth.js"
ITERATIONS = 200_000


def main() -> None:
    print("CAMBIO DE CONTRASEÑA DEL MODO DOCENTE")
    password = getpass.getpass("Nueva contraseña (mínimo 14 caracteres): ")
    confirm = getpass.getpass("Repite la contraseña: ")
    if len(password) < 14:
        raise SystemExit("La contraseña debe tener al menos 14 caracteres.")
    if password != confirm:
        raise SystemExit("Las contraseñas no coinciden. No se realizó ningún cambio.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=32)
    source = f'''// Verificación local del modo docente. Requiere localhost o HTTPS.
// Para cambiar la contraseña, ejecuta: python tools/generar_clave_admin.py
const SALT_HEX = "{salt.hex()}";
const PASSWORD_HASH_HEX = "{digest.hex()}";
const ITERATIONS = {ITERATIONS};

function fromHex(hex) {{
  return new Uint8Array(hex.match(/.{{1,2}}/g).map(byte => parseInt(byte, 16)));
}}

export async function verifyAdminPassword(password) {{
  if (!globalThis.crypto?.subtle) {{
    throw new Error("La verificación segura requiere abrir la aplicación en localhost o HTTPS.");
  }}
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    {{ name: "PBKDF2", salt: fromHex(SALT_HEX), iterations: ITERATIONS, hash: "SHA-256" }},
    keyMaterial,
    256
  );
  const candidate = new Uint8Array(derived);
  const expected = fromHex(PASSWORD_HASH_HEX);
  let difference = candidate.length ^ expected.length;
  for (let i = 0; i < Math.min(candidate.length, expected.length); i++) difference |= candidate[i] ^ expected[i];
  return difference === 0;
}}
'''
    OUTPUT.write_text(source, encoding="utf-8")
    print(f"Contraseña actualizada. Archivo: {OUTPUT.relative_to(ROOT)}")
    print("No compartas admin-auth.js ni publiques esta contraseña.")


if __name__ == "__main__":
    main()
