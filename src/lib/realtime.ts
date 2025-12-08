import { redis } from "@/lib/redis";
import { InferRealtimeEvents, Realtime } from "@upstash/realtime";
import z from "zod";

const message = z.object({
  id: z.string(),
  senderToken: z.string(),
  ciphertext: z.string(),
  iv: z.string(),
  timestamp: z.number(),
  roomId: z.string(),
  step: z.number(),
});

const schema = {
  chat: {
    message,
    destroy: z.object({
      isDestroyed: z.literal(true),
    }),
    participants: z.object({
      count: z.number(),
    }),
  },
};

export const realtime = new Realtime({ schema, redis });
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
export type Message = z.infer<typeof message>;
