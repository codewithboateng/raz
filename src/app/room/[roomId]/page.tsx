"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useRealtime } from "@/lib/realtime-client";
import { EncryptionShield } from "@/components/encryption-shield";
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
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
  const [isDestroying, setIsDestroying] = useState(false);

  const [secret, setSecret] = useState<string | null>(null);
  const [secretReady, setSecretReady] = useState(false);

  // per-sender ratchet state
  const senderKeysRef = useRef<Map<string, Uint8Array>>(new Map());
  const senderStepsRef = useRef<Map<string, number>>(new Map());

  type MetaData = {
    ttl: number | null;
    mode: "pair" | "group";
    capacity: number | null;
    isOwner: boolean;
    expiresAt: number | null;
    master?: boolean;
  };

  const { data: metaData } = useQuery<MetaData>({
    queryKey: ["room-meta", roomId],
    queryFn: async () => {
      const res = await client.room.meta.get({ query: { roomId } });
      if (!res.data) {
        throw new Error("Room metadata unavailable");
      }
      return res.data as MetaData;
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
    }, 5000); // Update every 5 seconds instead of 1

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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
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
            const plaintext = await decryptWithRatchet(
              msg.ciphertext,
              msg.iv,
              key
            );
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

  const decryptedMap = useMemo(
    () => new Map(Object.entries(processed?.decrypted ?? {})),
    [processed]
  );
  const nameMap = useMemo(
    () => new Map(Object.entries(processed?.names ?? {})),
    [processed]
  );
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
    },
    onMutate: async ({ text }) => {
      // Clear input immediately for instant feedback
      setInput("");

      // Don't add optimistic message - it breaks ratchet state
      // Just let the real message come through via realtime

      return { text }; // Save for error rollback
    },
    onError: (err, variables, context) => {
      // Restore input on error
      if (context?.text) {
        setInput(context.text);
      }
    },
  });

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy", "chat.participants"],
    onData: async ({ event, data }) => {
      if (event === "chat.message") {
        const newMessage = data as Message;

        // Decrypt only the new message
        if (secret) {
          try {
            const senderToken = newMessage.senderToken;
            const key = await ensureSenderKey(senderToken);
            const currentStep = senderStepsRef.current.get(senderToken) ?? 0;

            // Only decrypt if this is the expected next step
            if (newMessage.step === currentStep) {
              const plaintext = await decryptWithRatchet(
                newMessage.ciphertext,
                newMessage.iv,
                key
              );

              // Update cache with new decrypted message
              queryClient.setQueryData<ProcessedMessages>(
                ["messages", roomId, secret],
                (old) => {
                  if (!old) return old;

                  // Check if this message already exists (prevent duplicates)
                  const messageExists = old.messages.some(
                    (msg) => msg.id === newMessage.id
                  );

                  if (messageExists) {
                    return old; // Don't add duplicate
                  }

                  const newDecrypted = { ...old.decrypted, [newMessage.id]: plaintext };
                  const newNames = { ...old.names };

                  // Extract sender name if present
                  try {
                    const parsed = JSON.parse(plaintext);
                    if (parsed?.sender) {
                      newNames[senderToken] = parsed.sender;
                    }
                  } catch {
                    // ignore
                  }

                  return {
                    messages: [...old.messages, newMessage],
                    decrypted: newDecrypted,
                    names: newNames,
                    steps: old.steps.map(([token, step]) =>
                      token === senderToken ? [token, step + 1] : [token, step]
                    ) as Array<[string, number]>,
                    keys: old.keys,
                  };
                }
              );

              // Update ratchet state
              const ivBytes = base64ToBytes(newMessage.iv);
              const nextKey = await ratchetForward(key, ivBytes);
              senderKeysRef.current.set(senderToken, nextKey);
              senderStepsRef.current.set(senderToken, currentStep + 1);
            } else {
              // Out of order message, refetch to resync
              refetch();
            }
          } catch (error) {
            console.error("Failed to decrypt new message:", error);
            // Fallback to full refetch
            refetch();
          }
        }
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
      setIsDestroying(true);
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
            Open the full room link that includes the <code>#k=</code> fragment
            to decrypt messages.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col h-screen max-h-screen overflow-hidden bg-linear-to-b from-zinc-950 via-black to-zinc-950">
      <div className="ambient-grid" />

      {/* Header - Responsive Layout */}
      <header className="relative z-10 border-b border-zinc-700/30 bg-zinc-900/40 backdrop-blur-md">
        {/* Top row: Room info and destroy button */}
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Room ID Section - Compact on Mobile */}
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Room
              </span>
              <div className="flex items-center gap-2 sm:gap-3 mt-0.5 min-w-0">
                <span className="font-bold text-green-500 truncate font-mono text-xs sm:text-sm">
                  {roomId.slice(0, 6) + "..."}
                </span>
                <button
                  onClick={copyLink}
                  className={`button-smooth text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-1 rounded font-semibold transition-all duration-300 shrink-0 ${copyStatus === "COPIED!"
                    ? "copy-feedback bg-green-900/40 text-green-400"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-green-900/40 hover:text-green-400"
                    }`}
                >
                  {copyStatus === "COPIED!" ? "✓" : "COPY"}
                </button>
              </div>
            </div>
          </div>

          {/* Destroy button - Prominent on mobile */}
          <button
            onClick={() => destroyRoom()}
            disabled={metaData?.mode === "group" && !metaData.isOwner}
            title={
              metaData?.mode === "group" && !metaData.isOwner
                ? "Only the room creator can destroy this room"
                : "Destroy this room and all messages"
            }
            className={`button-smooth px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all group flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2 ${metaData?.mode === "group" && !metaData.isOwner
              ? "bg-zinc-800/30 text-zinc-500 cursor-not-allowed opacity-50"
              : "bg-red-600/20 hover:bg-red-600/60 text-red-400 hover:text-red-200 shadow-lg hover:shadow-red-500/30 active:scale-95"
              }`}
          >
            <span className="group-hover:animate-pulse text-sm sm:text-base">
              💣
            </span>
            <span className="hidden sm:inline">DESTROY</span>
          </button>
        </div>

        {/* Bottom row: Stats - Responsive Grid */}
        <div className="border-t border-zinc-700/30 p-3 sm:p-4 grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Encryption Status */}
          <div className="flex items-center gap-2">
            <EncryptionShield className="w-4 h-4 text-green-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">
                E2E
              </span>
              <span className="text-xs font-bold text-green-500">Active</span>
            </div>
          </div>

          {/* Participants */}
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">
              Users
            </span>
            <span className="text-sm font-bold text-cyan-400">
              {participantCount ?? 0}/
              {metaData?.capacity === null ? "∞" : metaData?.capacity ?? 2}
            </span>
          </div>

          {/* Self-Destruct Timer */}
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">
              TTL
            </span>
            <span
              className={`text-sm font-bold font-mono ${timeRemaining !== null && timeRemaining < 60
                ? "text-red-500"
                : "text-amber-500"
                }`}
            >
              {timeRemaining !== null
                ? formatTimeRemaining(timeRemaining)
                : "--:--"}
            </span>
          </div>

          {/* Copy status indicator - mobile only */}
          <div className="hidden sm:flex flex-col">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">
              Link
            </span>
            <span className="text-xs font-bold text-zinc-400">Encrypted</span>
          </div>
        </div>
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 scrollbar-thin message-list">
        {messages?.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm font-mono">
              No messages yet, start the conversation.
            </p>
          </div>
        )}

        {messages?.map((msg, idx) => {
          const decrypted = decryptedMap.get(msg.id);
          let displayText =
            decrypted ?? (isDecrypting ? "Decrypting..." : "[Encrypted]");
          let displaySender =
            nameMap.get(msg.senderToken) ??
            (msg.senderToken === ""
              ? "Unknown"
              : `Peer ${msg.senderToken.slice(0, 6)}`);
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
            <div
              key={msg.id}
              className={`flex message-item message-enter ${`message-stagger-${Math.min(
                idx % 4,
                3
              )}`} ${isMe ? "justify-end" : "justify-start"} ${isDestroying ? `message-destroy-waterfall` : ""
                }`}
              style={
                isDestroying
                  ? {
                    animationDelay: `${idx * 50}ms`,
                  }
                  : undefined
              }
            >
              <div className="max-w-[90%] sm:max-w-[80%]">
                <div className="flex items-baseline gap-2 mb-1 sm:mb-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${isMe ? "text-amber-400" : "text-cyan-400"
                      }`}
                  >
                    {isMe ? "YOU" : displaySender}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-zinc-600">
                    {displayTime}
                  </span>
                </div>

                <div
                  className={`message-bubble px-3 sm:px-4 py-2 sm:py-3 rounded-lg ${isMe ? "message-bubble own" : "message-bubble other"
                    }`}
                >
                  <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed break-all font-medium">
                    {displayText}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 sm:p-4 border-t border-zinc-700/30 bg-zinc-900/40 backdrop-blur-md">
        <div className="flex gap-2 sm:gap-3">
          <div className="flex-1 relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 opacity-60">
              {">"}
            </span>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={input}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  sendMessage({ text: input });
                  inputRef.current?.focus();
                }
              }}
              placeholder="Message..."
              onChange={(e) => setInput(e.target.value)}
              className="input-focus-glow w-full bg-zinc-950/60 border border-zinc-700 focus:border-green-500/50 focus:outline-none transition-all text-zinc-100 placeholder:text-zinc-700 py-2 sm:py-3 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm rounded-lg"
            />
          </div>

          <div className="send-button-wrapper">
            <button
              onClick={() => {
                sendMessage({ text: input });
                inputRef.current?.focus();
              }}
              disabled={!input.trim() || isPending}
              className={`button-smooth px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-bold rounded-lg transition-all duration-300 transform flex items-center justify-center gap-1 sm:gap-2 shrink-0 ${input.trim()
                ? "bg-linear-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-lg hover:shadow-green-500/50 active:scale-95"
                : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                }`}
            >
              {isPending ? (
                <span className="animate-spin text-sm">⟳</span>
              ) : (
                <>
                  <span className="hidden sm:inline">SEND</span>
                  <span className="sm:hidden">→</span>
                  <svg
                    className="w-4 h-4 hidden sm:block"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Page;
