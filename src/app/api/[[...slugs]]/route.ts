import { redis } from "@/lib/redis";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { authMiddleware } from "./auth";
import { z } from "zod";
import { Message, realtime } from "@/lib/realtime";

const ROOM_TTL_SECONDS = 60 * 10;
const MASTER_PASSCODE = process.env.MASTER_PASSCODE;
type RoomMode = "pair" | "group";

const rooms = new Elysia({ prefix: "/room" })
  .post(
    "/create",
    async ({ body, set }) => {
      const mode: RoomMode = body?.mode === "group" ? "group" : "pair";
      const passcode = body?.passcode?.trim();
      const isMaster = MASTER_PASSCODE && passcode === MASTER_PASSCODE;

      if (mode === "group" && !passcode) {
        set.status = 400;
        return { error: "Passcode required for group rooms" };
      }

      const roomId = nanoid();
      const metaPayload: Record<string, unknown> = {
        connected: [],
        createdAt: Date.now(),
        mode,
      };

      if (mode === "group" && passcode) {
        metaPayload.passcode = passcode;
      }
      if (isMaster) {
        metaPayload.master = "true";
      }

      await redis.hset(`meta:${roomId}`, metaPayload);

      if (isMaster) {
        await redis.persist(`meta:${roomId}`);
      } else {
        await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);
      }

      return { roomId, mode };
    },
    {
      body: z
        .object({
          mode: z.enum(["pair", "group"]).optional(),
          passcode: z.string().max(100).optional(),
        })
        .optional(),
    }
  )
  .use(authMiddleware)
  .get(
    "/meta",
    async ({ auth }) => {
      const meta = await redis.hgetall<{
        connected: string[];
        mode?: RoomMode;
        ownerToken?: string;
        master?: string;
      }>(`meta:${auth.roomId}`);

      const mode = meta?.mode ?? "pair";
      const isMaster = meta?.master === "true";
      const capacity = isMaster ? null : mode === "group" ? 12 : 2;
      const isOwner = auth.token === meta?.ownerToken;
      const ttl = await redis.ttl(`meta:${auth.roomId}`);
      const safeTtl = isMaster ? null : ttl > 0 ? ttl : 0;

      return {
        mode,
        capacity,
        isOwner,
        ttl: safeTtl,
        expiresAt: safeTtl ? Date.now() + safeTtl * 1000 : null,
        master: isMaster,
      };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .get(
    "/participants",
    async ({ auth }) => {
      const meta = await redis.hgetall(`meta:${auth.roomId}`);
      const connected = (meta?.connected as string[]) || [];
      return { count: connected.length };
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .delete(
    "/",
    async ({ auth, set }) => {
      const meta = await redis.hgetall<{
        mode?: RoomMode;
        ownerToken?: string;
      }>(`meta:${auth.roomId}`);

      const mode = meta?.mode ?? "pair";
      const isOwner = auth.token === meta?.ownerToken;

      if (mode === "group" && !isOwner) {
        set.status = 403;
        return { error: "Only the room owner can destroy this room" };
      }

      await realtime
        .channel(auth.roomId)
        .emit("chat.destroy", { isDestroyed: true });

      await Promise.all([
        redis.del(auth.roomId),
        redis.del(`meta:${auth.roomId}`),
        redis.del(`messages:${auth.roomId}`),
      ]);
    },
    { query: z.object({ roomId: z.string() }) }
  );

const messages = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth }) => {
      const { senderToken, ciphertext, iv, step } = body;
      const { roomId } = auth;

      const roomExists = await redis.exists(`meta:${roomId}`);

      if (!roomExists) {
        throw new Error("Room does not exist");
      }

      const message: Message = {
        id: nanoid(),
        senderToken,
        ciphertext,
        iv,
        timestamp: Date.now(),
        roomId,
        step,
      };

      // add message to history
      await redis.rpush(`messages:${roomId}`, {
        ...message,
        token: auth.token,
      });
      await realtime.channel(roomId).emit("chat.message", message);

      // housekeeping
      const remaining = await redis.ttl(`meta:${roomId}`);

      if (remaining > 0) {
        await redis.expire(`messages:${roomId}`, remaining);
        await redis.expire(`history:${roomId}`, remaining);
        await redis.expire(roomId, remaining);
      } else {
        await redis.persist(`messages:${roomId}`);
        await redis.persist(`history:${roomId}`);
        await redis.persist(roomId);
      }
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({
        senderToken: z.string().max(256),
        ciphertext: z.string().max(5000),
        iv: z.string().max(200),
        step: z.number(),
      }),
    }
  )
  .get(
    "/",
    async ({ auth }) => {
      const messages = await redis.lrange<Message>(`messages:${auth.roomId}`, 0, -1);

      return { messages };
    },
    { query: z.object({ roomId: z.string() }) }
  );

const app = new Elysia({ prefix: "/api" }).use(rooms).use(messages);

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;

export type App = typeof app;
