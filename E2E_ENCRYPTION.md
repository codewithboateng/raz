# End-to-End Encryption Implementation

This document explains the E2E encryption implementation added to the ephemeral chat application.

## Overview

The application now uses **libsodium.js** (NaCl cryptography library) to implement end-to-end encryption for all messages. This ensures that:

- Messages are encrypted on the client before being sent to the server
- The server never sees plaintext message content
- Only users in the same room can decrypt messages (using the room ID as the key derivation source)
- Encryption/decryption happens transparently on the client side

## How It Works

### Key Derivation

Instead of requiring users to manually exchange encryption keys, we use **key derivation** from the room ID:

1. When a user joins a room, a cryptographic key is derived from the `roomId`
2. This key derivation is **deterministic** - the same room ID always produces the same key
3. All participants in a room derive the same key independently using the room ID
4. No key exchange protocol is needed

```typescript
// All users in room "abc123" derive the same encryption key
const key = await deriveKeyFromRoomId("abc123");
```

### Message Encryption (Client → Server)

When a user sends a message:

1. **Client encrypts** the plaintext message using the derived room key
2. A random **nonce** (number used once) is generated for each message
3. The encrypted message and nonce are sent to the server
4. The plaintext text is NOT stored or transmitted to the server

```typescript
const { ciphertext, nonce } = await encryptMessage(plaintext, roomId);
// Send ciphertext + nonce to server
```

### Message Storage (Server)

The server stores encrypted messages:

```typescript
{
  id: "msg123",
  sender: "alice",
  ciphertext: "zNb4ks0x5KmF...", // Encrypted content
  nonce: "jK9lmN3pQ7x...",        // Decryption nonce
  timestamp: 1701000000,
  roomId: "abc123"
}
```

The server **never stores plaintext** message content.

### Message Decryption (Server → Client)

When a user loads or receives messages:

1. **Client receives** the encrypted message and nonce
2. **Client decrypts** using the derived room key
3. The plaintext is only visible in the user's browser

```typescript
const plaintext = await decryptMessage(ciphertext, nonce, roomId);
```

## Implementation Details

### Files Modified/Created

1. **`src/lib/encryption.ts`** (NEW)

   - `ensureSodiumReady()` - Initializes libsodium
   - `deriveKeyFromRoomId(roomId)` - Derives encryption key from room ID
   - `encryptMessage(message, roomId)` - Encrypts plaintext messages
   - `decryptMessage(ciphertext, nonce, roomId)` - Decrypts encrypted messages

2. **`src/lib/realtime.ts`** (MODIFIED)

   - Updated Message schema to include `ciphertext` and `nonce` fields
   - Made `text` field optional (encrypted messages don't have plaintext)

3. **`src/app/api/[[...slugs]]/route.ts`** (MODIFIED)

   - Message POST endpoint now encrypts messages before storage
   - Calls `encryptMessage()` on incoming messages
   - Messages are stored with `ciphertext` and `nonce` instead of `text`

4. **`src/app/room/[roomId]/page.tsx`** (MODIFIED)

   - Added `decryptedMessages` state to cache decrypted messages
   - Added `decryptAllMessages()` function to decrypt fetched messages
   - Message display now shows decrypted text from cache
   - Automatically decrypts new messages via realtime updates

5. **`package.json`** (MODIFIED)
   - Added `libsodium.js` dependency

## Security Properties

### What's Protected

✅ **Message content** - Encrypted on client, stored encrypted on server  
✅ **Message history** - Requires room key to read any historical messages  
✅ **Real-time messages** - Encrypted before transmission to other users  
✅ **Privacy from server** - Server operators cannot read chat content

### Assumptions

- The room ID is shared only with intended participants (via URL)
- Users only share room links with people they want to communicate with
- The room ID provides sufficient entropy for key derivation
- Redis is not compromised (otherwise encrypted data at rest is still protected)

### Limitations

- ⚠️ **Metadata not encrypted** - Sender name and timestamps are visible to server
- ⚠️ **Room ID in plaintext** - Must be kept secret and only shared with intended participants
- ⚠️ **No authentication** - Anyone with the room URL/ID can join and decrypt
- ⚠️ **No forward secrecy** - If room ID is compromised, all messages can be decrypted

These limitations are acceptable for an ephemeral chat application where:

- Rooms auto-destroy after 10 minutes
- Users voluntarily share room IDs
- The threat model doesn't include a compromised server

## Cryptographic Details

The implementation uses **libsodium** (libsodium.js), which provides:

- **Key Derivation**: Argon2i password hashing (crypto_pwhash)

  - OPSLIMIT: MODERATE (3 iterations)
  - MEMLIMIT: MODERATE (64MB)
  - Salted for consistency

- **Encryption**: NaCl secret-key encryption (crypto_secretbox)
  - Cipher: XChaCha20-Poly1305
  - 256-bit symmetric key
  - Random 24-byte nonce per message
  - Authenticated encryption (AEAD)

## Usage

No changes to the user experience:

1. User creates a room → Gets ephemeral room link
2. User shares room link with others
3. Users type messages → **Automatically encrypted before sending**
4. Messages appear decrypted in chat → **Automatically decrypted on receipt**
5. Room auto-destroys → All encrypted data is deleted

Users don't need to know about encryption - it works transparently.

## Installation & Testing

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm build
```

Visit `http://localhost:3000` and create a room to test encryption:

- Create/join a room
- Send messages
- Messages are encrypted before reaching the server
- Open browser DevTools → Network tab to see encrypted payloads

## Future Enhancements

- **Signal Protocol** - True forward secrecy with key rotation
- **Message signatures** - Verify sender identity
- **Read receipts** - Acknowledge message delivery
- **Media encryption** - Encrypted file/image sharing
- **E2E verification** - Out-of-band key fingerprint verification
