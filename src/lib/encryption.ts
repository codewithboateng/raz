/**
 * Simple base64 encoding that works in both browser and Bun
 */
function encodeBase64(bytes: Uint8Array): string {
  // Check if btoa is available (browser/Bun environment)
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Fallback for other environments
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  throw new Error("Base64 encoding not available");
}

/**
 * Simple base64 decoding that works in both browser and Bun
 */
function decodeBase64(str: string): Uint8Array {
  // Check if atob is available (browser/Bun environment)
  if (typeof atob !== "undefined") {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Fallback for other environments
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }

  throw new Error("Base64 decoding not available");
}

/**
 * Derives a key from a room ID using HKDF
 * Uses Web Crypto API which is available in Bun and all modern browsers
 */
async function deriveKeyFromRoomId(roomId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const roomIdBytes = encoder.encode(roomId);

  // Import the room ID as a key
  const material = await crypto.subtle.importKey(
    "raw",
    roomIdBytes,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // Derive 32 bytes for AES-256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(16), // Fixed salt for deterministic derivation
      info: new TextEncoder().encode("raz-e2e-encryption"),
    },
    material,
    256 // 32 bytes = 256 bits
  );

  // Import the derived key for AES-GCM
  return crypto.subtle.importKey(
    "raw",
    derivedBits,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a message using the room's derived key
 */
export async function encryptMessage(
  message: string,
  roomId: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKeyFromRoomId(roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv } as any,
    key,
    messageBytes as any
  );

  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

/**
 * Decrypts a message using the room's derived key
 */
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  roomId: string
): Promise<string> {
  const key = await deriveKeyFromRoomId(roomId);
  const ciphertextBytes = decodeBase64(ciphertext);
  const ivBytes = decodeBase64(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes } as any,
    key,
    ciphertextBytes as any
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
