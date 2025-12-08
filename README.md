## Overview

Raz, end-to-end encrypted chat. Rooms self-destruct after a short TTL by default (unless overridden) and messages are encrypted client-side; the server never sees plaintext. Links carry the decryption secret (fragment/query), so users still copy a single URL.

## Features
- E2E encryption per room (secret from fragment/query or passcode; per-sender hash ratchet; ciphertext/iv only stored server-side)
- Self-destruct timer shared across all participants (unless master override)
- Two room modes: 1:1 or group (up to 12) with mandatory passcode
- Owner-only destroy in group rooms; either participant can destroy 1:1 rooms
- Live updates via Upstash Realtime (new messages, participants, destroy)
- Lobby flow to create rooms or join by id + passcode; join links include the secret

## Stack
- Next.js (App Router, client components) + TypeScript
- Elysia server routes under `src/app/api/[[...slugs]]/route.ts`
- Upstash Redis (storage + TTL) and Upstash Realtime (pub/sub)
- Bun (recommended runtime)

## Prerequisites
- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Upstash Redis + Realtime credentials available as env vars:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - (Realtime uses the same Redis project)

## Getting Started
```bash
# Install deps
bun install

# Run dev server
bun run dev
```

Then open `http://localhost:3000`.

## Usage
1) Lobby
- Create 1:1 room: click “CREATE 1:1 ROOM” (secret auto-generated and embedded in link/query/fragment).
- Create group room: enter a passcode and click “CREATE GROUP ROOM” (capacity 12; passcode doubles as the encryption secret).
- Join existing room: enter room id + passcode and click “JOIN ROOM” (passcode saved locally and appended to link/fragment).

2) In-room
- Share the room URL; it includes the `#k=` (and passcode for group) so others can decrypt.
- Timer is shared; when it hits 0, room redirects to destroyed state.
- Only the creator can destroy a group room; either user can destroy a 1:1 room.
- Messages display decrypted content; ciphertext is stored server-side.

## Key Files
- `src/app/page.tsx` — Lobby create/join flows
- `src/app/room/[roomId]/page.tsx` — Chat UI, countdown, message decrypt
- `src/app/api/[[...slugs]]/route.ts` — Room/message APIs, destroy logic
- `src/proxy.ts` — Middleware to gate room entry (capacity, passcode, tokens)
- `src/lib/encryption.ts` — Fragment/passcode-derived secret, per-sender hash ratchet (AES-GCM)
- `src/lib/realtime.ts` — Upstash Realtime schema/events

## Notes
- TTL is enforced in Redis; `/room/meta` returns `expiresAt` so all clients stay in sync.
- Room ownership is recorded on first entrant; stored in room metadata.
- Clipboard copy in-room shares the URL with the embedded secret; group links include passcode. 
- Server sees only ciphertext, iv, pseudonymous sender token, and ratchet step; plaintext and human names are client-side.

## Scripts
- `bun run dev` — start dev server
- `bun run build` — production build
- `bun run start` — start built app
- `bun run lint` — lint with eslint
