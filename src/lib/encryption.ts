/**
 * E2E encryption helpers with a simple hash ratchet.
 * - A high-entropy secret (from URL fragment) is the root key.
 * - Each message advances the ratchet: key_{n+1} = HMAC-SHA256(key_n, iv_n)
 * - AES-GCM is used for payload encryption.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(str: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(str, "base64"));
}

export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64(bytes);
}

async function hkdf(
  secretBytes: Uint8Array,
  info: string
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes as BufferSource,
    "HKDF",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32), // deterministic
      info: encoder.encode(info),
    },
    key,
    256
  );
}

export async function deriveInitialKey(
  secretMaterial: string
): Promise<Uint8Array> {
  const secretBytes = encoder.encode(secretMaterial);
  const bits = await hkdf(secretBytes, "raz-e2e-root");
  return new Uint8Array(bits);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hmacSha256(
  keyBytes: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return new Uint8Array(sig);
}

export async function ratchetForward(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array
): Promise<Uint8Array> {
  return hmacSha256(keyBytes, ivBytes);
}

export async function deriveSenderToken(
  secret: string,
  sender: string
): Promise<string> {
  const root = await deriveInitialKey(secret);
  const tokenBytes = await hmacSha256(root, encoder.encode(sender));
  return encodeBase64(tokenBytes);
}

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  step: number;
};

export async function encryptWithRatchet(
  plaintext: string,
  currentKey: Uint8Array,
  step: number
): Promise<{ payload: EncryptedPayload; nextKey: Uint8Array }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await importAesKey(currentKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    encoder.encode(plaintext)
  );

  const nextKey = await ratchetForward(currentKey, ivBytes);

  return {
    payload: {
      ciphertext: encodeBase64(new Uint8Array(encrypted)),
      iv: encodeBase64(ivBytes),
      step,
    },
    nextKey,
  };
}

export async function decryptWithRatchet(
  ciphertext: string,
  iv: string,
  keyBytes: Uint8Array
): Promise<string> {
  const ivBytes = decodeBase64(iv);
  const aesKey = await importAesKey(keyBytes);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes as BufferSource },
    aesKey,
    decodeBase64(ciphertext) as BufferSource
  );
  return decoder.decode(decrypted);
}
