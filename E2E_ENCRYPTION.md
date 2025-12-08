# End-to-End Encryption Implementation

This document explains how end-to-end encryption (E2EE) works in the app and where it lives in the codebase.

## Overview
- Encryption uses **TweetNaCl** (NaCl primitives).
- Messages are encrypted on the client; the server only stores ciphertext + nonce.
- A room-specific key is deterministically derived from the `roomId`; all participants compute the same key independently.
- Decryption happens client-side on load and on realtime updates.

## How It Works
### Key derivation
```ts
const key = deriveKeyFromRoomId(roomId); // deterministic 32-byte key
```
Every participant in the same room derives the same key from the room id; no separate key exchange is needed.

### Encrypt (client → server)
```ts
const { ciphertext, iv } = encryptMessage(plaintext, roomId);
// send { ciphertext, iv } to the server; plaintext is never sent
```
Each message uses a fresh 24-byte nonce (`iv`). The server stores only ciphertext and nonce.

### Decrypt (server → client)
```ts
const plaintext = decryptMessage(ciphertext, iv, roomId);
```
Clients decrypt after fetching history or receiving realtime events.

## Code Map
- `src/lib/encryption.ts` — `deriveKeyFromRoomId`, `encryptMessage`, `decryptMessage` (XSalsa20-Poly1305 via TweetNaCl; synchronous)
- `src/lib/realtime.ts` — Message schema includes `ciphertext`, `iv`, optional `text`
- `src/app/api/[[...slugs]]/route.ts` — Message POST encrypts before storing; messages are returned encrypted
- `src/app/room/[roomId]/page.tsx` — Decrypts fetched messages client-side for display

## Security Properties
✅ Message content encrypted at rest/in transit (server never sees plaintext)  
✅ History protected by room key (same derivation as live messages)  
⚠️ Metadata not encrypted (sender, timestamp, room id)  
⚠️ Possession of room id (and passcode, for group rooms) grants decryption  
⚠️ No forward secrecy (compromise of room id reveals past messages)

## Cryptography
- Primitive: `secretbox` (XSalsa20-Poly1305 AEAD)
- Key: 32 bytes derived from `roomId`
- Nonce: 24 random bytes per message (`iv`)
- Authenticated encryption ensures integrity + confidentiality

## Usage Notes
- Works automatically in UI; users don’t handle keys.
- Share room URL (and passcode for group rooms) only with intended participants.
- Rooms auto-expire; expiry is enforced server-side and exposed to clients as `expiresAt`.

## Local Dev
```bash
bun install
bun run dev
```

Create/join a room and send messages; inspect network payloads to see ciphertext and nonce instead of plaintext.
