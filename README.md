## Overview

Raz, end-to-end encrypted chat built with Next.js + Elysia, Upstash Redis/Realtime, and Bun. Rooms self-destruct after a short TTL and messages are encrypted client-side; the server never sees plaintext.

## Features
- E2E encryption per room (key derived from room id; ciphertext/iv only stored server-side)
- Self-destruct timer shared across all participants
- Two room modes: 1:1 or group (up to 12) with mandatory passcode
- Owner-only destroy in group rooms; either participant can destroy 1:1 rooms
- Live updates via Upstash Realtime (new messages, participants, destroy)
- Lobby flow to create rooms or join by id + passcode

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
- Create 1:1 room: click “CREATE 1:1 ROOM”.
- Create group room: enter a passcode and click “CREATE GROUP ROOM” (capacity 12).
- Join existing room: enter room id + passcode and click “JOIN ROOM”.

2) In-room
- Share the room URL. For group rooms, others must supply the passcode on join.
- Timer is shared; when it hits 0, room redirects to destroyed state.
- Only the creator can destroy a group room; either user can destroy a 1:1 room.
- Messages display decrypted content; ciphertext is stored server-side.

## Key Files
- `src/app/page.tsx` — Lobby create/join flows
- `src/app/room/[roomId]/page.tsx` — Chat UI, countdown, message decrypt
- `src/app/api/[[...slugs]]/route.ts` — Room/message APIs, destroy logic
- `src/proxy.ts` — Middleware to gate room entry (capacity, passcode, tokens)
- `src/lib/encryption.ts` — XSalsa20-Poly1305 helpers (TweetNaCl)
- `src/lib/realtime.ts` — Upstash Realtime schema/events

## Notes
- TTL is enforced in Redis; `/room/meta` returns `expiresAt` so all clients stay in sync.
- Room ownership is recorded on first entrant; stored in room metadata.
- Clipboard copy in-room shares the URL; for group rooms, recipients still need the passcode.

## Scripts
- `bun run dev` — start dev server
- `bun run build` — production build
- `bun run start` — start built app
- `bun run lint` — lint with eslint
