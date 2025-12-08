"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useRealtime } from "@/lib/realtime-client";
import {
  decryptWithRatchet,
  deriveInitialKey,
  deriveSenderToken,
  encryptWithRatchet,
  ratchetForward,
} from "@/lib/encryption";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import type { Message } from "@/lib/realtime";

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const Page = () => {
  const params = useParams();
  const roomId = params.roomId as string;

  const router = useRouter();
  const searchParams = useSearchParams();

  const { username } = useUsername();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [copyStatus, setCopyStatus] = useState("COPY");
  const [now, setNow] = useState(() => Date.now());

  const [secret, setSecret] = useState<string | null>(null);
  const [secretReady, setSecretReady] = useState(false);

  // per-sender ratchet state
  const senderKeysRef = useRef<Map<string, Uint8Array>>(new Map());
  const senderStepsRef = useRef<Map<string, number>>(new Map());

  const { data: metaData } = useQuery<{
    ttl: number | null;
    mode: "pair" | "group";
    capacity: number | null;
    isOwner: boolean;
    expiresAt: number | null;
    master?: boolean;
  }>({
    queryKey: ["room-meta", roomId],
    queryFn: async () => {
      const res = await client.room.meta.get({ query: { roomId } });
      if (!res.data) {
        throw new Error("Room metadata unavailable");
      }
      return res.data;
    },
  });

  // Initialize sender key from secret and sender token
  const ensureSenderKey = useCallback(
    async (senderToken: string) => {
      if (!secret) throw new Error("Missing room secret");
      if (senderKeysRef.current.has(senderToken)) {
        return senderKeysRef.current.get(senderToken)!;
      }
      const key = await deriveInitialKey(`${secret}:${senderToken}`);
      senderKeysRef.current.set(senderToken, key);
      if (!senderStepsRef.current.has(senderToken)) {
        senderStepsRef.current.set(senderToken, 0);
      }
      return key;
    },
    [secret]
  );

  const base64ToBytes = useCallback((str: string) => {
    if (typeof atob !== "undefined") {
      return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
    }
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(str, "base64"));
    }
    throw new Error("No base64 decoder available");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (secretReady && secret) return;

    const url = new URL(window.location.href);
    const stored = sessionStorage.getItem(`room-secret:${roomId}`);
    const fragmentMatch = window.location.hash.match(/k=([^&]+)/);
    const passcode = url.searchParams.get("passcode");
    const querySecret = url.searchParams.get("k");

    const found =
      stored ??
      (fragmentMatch?.[1] ? decodeURIComponent(fragmentMatch[1]) : null) ??
      (passcode ? decodeURIComponent(passcode) : null) ??
      (querySecret ? decodeURIComponent(querySecret) : null);

    if (fragmentMatch?.[1]) {
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }

    startTransition(() => {
      if (found) {
        sessionStorage.setItem(`room-secret:${roomId}`, found);
        setSecret(found);
      }
      setSecretReady(true);
    });
  }, [roomId, secret, secretReady]);

  const { data: participantCount } = useQuery<number>({
    queryKey: ["participants", roomId],
    queryFn: async (): Promise<number> => {
      const res = await client.room.participants.get({ query: { roomId } });
      const count = res.data?.count;
      if (typeof count !== "number") {
        throw new Error("Participant count unavailable");
      }
      return count;
    },
  });

  useEffect(() => {
    const passcode = searchParams.get("passcode");
    if (passcode) {
      router.replace(`/room/${roomId}`);
    }
  }, [searchParams, router, roomId]);

  const expireAt = useMemo(
    () => (metaData?.expiresAt ? metaData.expiresAt : null),
    [metaData?.expiresAt]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const timeRemaining = useMemo(() => {
    if (!expireAt) return null;
    const remaining = Math.max(0, Math.round((expireAt - now) / 1000));
    return remaining;
  }, [expireAt, now]);

  useEffect(() => {
    if (timeRemaining === 0) {
      router.push("/?destroyed=true");
    }
  }, [timeRemaining, router]);

  type ProcessedMessages = {
    messages: Message[];
    decrypted: Record<string, string>;
    names: Record<string, string>;
    steps: Array<[string, number]>;
    keys: Array<[string, number[]]>;
  };

  const {
    data: processed,
    refetch,
    isFetching: isDecrypting,
  } = useQuery<ProcessedMessages>({
    queryKey: ["messages", roomId, secret],
    enabled: Boolean(secret),
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      if (!res.data || !secret) {
        throw new Error("Messages unavailable");
      }

      const decrypted: Record<string, string> = {};
      const names: Record<string, string> = {};
      const steps: Array<[string, number]> = [];
      const keys: Array<[string, number[]]> = [];

      const bySender = new Map<string, Message[]>();
      for (const m of res.data.messages) {
        const list = bySender.get(m.senderToken) ?? [];
        list.push(m);
        bySender.set(m.senderToken, list);
      }

      for (const [senderToken, list] of bySender) {
        const sorted = list.slice().sort((a, b) => a.step - b.step);
        const baseKey = await deriveInitialKey(`${secret}:${senderToken}`);
        let key = baseKey;
        let expectedStep = 0;

        for (const msg of sorted) {
          if (msg.step !== expectedStep) {
            expectedStep = msg.step;
          }
          try {
            const plaintext = await decryptWithRatchet(msg.ciphertext, msg.iv, key);
            decrypted[msg.id] = plaintext;
            try {
              const parsed = JSON.parse(plaintext);
              if (parsed?.sender) {
                names[senderToken] = parsed.sender as string;
              }
            } catch {
              // ignore
            }
          } catch {
            decrypted[msg.id] = "[Decryption failed]";
          }
          const ivBytes = base64ToBytes(msg.iv);
          key = await ratchetForward(key, ivBytes);
          expectedStep += 1;
        }

        steps.push([senderToken, expectedStep]);
        keys.push([senderToken, Array.from(key)]);
      }

      return { messages: res.data.messages, decrypted, names, steps, keys };
    },
  });

  useEffect(() => {
    if (!processed) return;
    const stepMap = new Map<string, number>(processed.steps);
    const keyMap = new Map<string, Uint8Array>(
      processed.keys.map(([token, arr]) => [token, new Uint8Array(arr)])
    );
    senderStepsRef.current = stepMap;
    senderKeysRef.current = keyMap;
  }, [processed]);

  const decryptedMap = useMemo(() => new Map(Object.entries(processed?.decrypted ?? {})), [processed]);
  const nameMap = useMemo(() => new Map(Object.entries(processed?.names ?? {})), [processed]);
  const messages = processed?.messages;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      if (!secret) throw new Error("Missing room secret");
      const senderToken = await deriveSenderToken(secret, username);
      await ensureSenderKey(senderToken);
      const currentStep = senderStepsRef.current.get(senderToken) ?? 0;
      const currentKey = senderKeysRef.current.get(senderToken)!;

      const payloadContent = JSON.stringify({
        sender: username,
        text,
        clientTimestamp: Date.now(),
      });

      const { payload, nextKey } = await encryptWithRatchet(
        payloadContent,
        currentKey,
        currentStep
      );

      await client.messages.post(
        {
          senderToken,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          step: payload.step,
        },
        { query: { roomId } }
      );

      senderKeysRef.current.set(senderToken, nextKey);
      senderStepsRef.current.set(senderToken, currentStep + 1);
      setInput("");
    },
  });

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy", "chat.participants"],
    onData: ({ event, data }) => {
      if (event === "chat.message") {
        refetch();
      }

      if (event === "chat.destroy") {
        router.push("/?destroyed=true");
      }

      if (event === "chat.participants" && "count" in data) {
        queryClient.setQueryData(["participants", roomId], data.count);
      }
    },
  });

  const { mutate: destroyRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } });
    },
  });

  const copyLink = () => {
    if (!secret) return;
    const base = new URL(window.location.origin);
    base.pathname = `/room/${roomId}`;
    if (metaData?.mode === "group") {
      base.searchParams.set("passcode", secret);
    }
    base.hash = `k=${encodeURIComponent(secret)}`;
    const url = base.toString();
    navigator.clipboard.writeText(url);
    setCopyStatus("COPIED!");
    setTimeout(() => setCopyStatus("COPY"), 2000);
  };

  if (!secretReady) {
    return (
      <main className="flex items-center justify-center h-screen">
        <p className="text-zinc-400 text-sm">Loading room key…</p>
      </main>
    );
  }

  if (!secret) {
    return (
      <main className="flex items-center justify-center h-screen">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-red-500 font-bold">Missing room key</p>
          <p className="text-zinc-400 text-sm">
            Open the full room link that includes the <code>#k=</code> fragment to decrypt messages.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col h-screen max-h-screen overflow-hidden">
      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Room ID</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-green-500 truncate">
                {roomId.slice(0, 10) + "..."}
              </span>
              <button
                onClick={copyLink}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              Participants
            </span>
            <span className="text-sm font-bold text-purple-500">
              {participantCount ?? 0}/
              {metaData?.capacity === null ? "∞" : metaData?.capacity ?? 2}
            </span>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              Self-Destruct
            </span>
            <span
              className={`text-sm font-bold flex items-center gap-2 ${
                timeRemaining !== null && timeRemaining < 60
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            >
              {timeRemaining !== null
                ? formatTimeRemaining(timeRemaining)
                : "--:--"}
            </span>
          </div>
        </div>

        <button
          onClick={() => destroyRoom()}
          disabled={metaData?.mode === "group" && !metaData.isOwner}
          title={
            metaData?.mode === "group" && !metaData.isOwner
              ? "Only the room creator can destroy this room"
              : undefined
          }
          className="text-xs bg-zinc-800 hover:bg-red-600 px-3 py-1.5 rounded text-zinc-400 hover:text-white font-bold transition-all group flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="group-hover:animate-pulse">💣</span>
          DESTROY NOW
        </button>
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages?.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm font-mono">
              No messages yet, start the conversation.
            </p>
          </div>
        )}

        {messages?.map((msg) => {
          const decrypted = decryptedMap.get(msg.id);
          let displayText = decrypted ?? (isDecrypting ? "Decrypting..." : "[Encrypted]");
          let displaySender =
            nameMap.get(msg.senderToken) ??
            (msg.senderToken === "" ? "Unknown" : `Peer ${msg.senderToken.slice(0, 6)}`);
          let displayTime = format(msg.timestamp, "HH:mm");

          if (decrypted) {
            try {
              const parsed = JSON.parse(decrypted);
              displayText = parsed.text ?? decrypted;
              if (parsed.sender) {
                displaySender = parsed.sender;
              }
              if (parsed.clientTimestamp) {
                displayTime = format(parsed.clientTimestamp, "HH:mm");
              }
            } catch {
              // fallback to raw decrypted string
            }
          }

          const isMe = displaySender === username;

          return (
            <div key={msg.id} className="flex flex-col items-start">
              <div className="max-w-[80%] group">
                <div className="flex items-baseline gap-3 mb-1">
                  <span
                    className={`text-xs font-bold ${
                      isMe ? "text-green-500" : "text-blue-500"
                    }`}
                  >
                    {isMe ? "YOU" : displaySender}
                  </span>

                  <span className="text-[10px] text-zinc-600">{displayTime}</span>
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed break-all">
                  {displayText}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex gap-4">
          <div className="flex-1 relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse">
              {">"}
            </span>
            <input
              autoFocus
              type="text"
              value={input}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  sendMessage({ text: input });
                  inputRef.current?.focus();
                }
              }}
              placeholder="Type message..."
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm"
            />
          </div>

          <button
            onClick={() => {
              sendMessage({ text: input });
              inputRef.current?.focus();
            }}
            disabled={!input.trim() || isPending}
            className={`px-6 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              input.trim()
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            SEND
          </button>
        </div>
      </div>
    </main>
  );
};

export default Page;
