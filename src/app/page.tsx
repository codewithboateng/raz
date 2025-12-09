"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { generateSecret } from "@/lib/encryption";
import { ParticleBackground } from "@/components/particle-background";
import { AnimatedLockIcon } from "@/components/animated-lock-icon";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useEffect } from "react";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

const Page = () => {
  const [isOnboarding, setIsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    const completed = localStorage.getItem("raz-onboarding-completed");
    // eslint-disable-next-line
    setIsOnboarding(completed !== "true");
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem("raz-onboarding-completed", "true");
    setIsOnboarding(false);
  };

  if (isOnboarding === null) return null; // Or a loading spinner

  if (isOnboarding) {
    return <OnboardingFlow onComplete={completeOnboarding} />;
  }

  return (
    <Suspense>
      <Lobby />
    </Suspense>
  );
};

export default Page;

function Lobby() {
  const { username } = useUsername();
  const router = useRouter();

  const searchParams = useSearchParams();
  const wasDestroyed = searchParams.get("destroyed") === "true";
  const error = searchParams.get("error");
  const roomFromParams = searchParams.get("room") ?? "";

  const [groupPasscode, setGroupPasscode] = useState("");
  const [joinRoomId, setJoinRoomId] = useState(roomFromParams);
  const [joinPasscode, setJoinPasscode] = useState("");
  const [isCreating1v1, setIsCreating1v1] = useState(false);

  const { mutate: createRoom } = useMutation({
    mutationFn: async () => {
      setIsCreating1v1(true);
      const res = await client.room.create.post({ mode: "pair" });

      if (res.status === 200) {
        const secret = generateSecret();
        if (typeof window !== "undefined" && res.data?.roomId) {
          sessionStorage.setItem(`room-secret:${res.data.roomId}`, secret);
        }
        const url = `/room/${res.data?.roomId}?k=${encodeURIComponent(
          secret
        )}#k=${encodeURIComponent(secret)}`;
        router.push(url);
      }
      setIsCreating1v1(false);
    },
  });

  const { mutate: createGroupRoom, isPending: isCreatingGroup } = useMutation({
    mutationFn: async () => {
      const passcode = groupPasscode.trim();
      if (!passcode) throw new Error("Passcode is required");

      const res = await client.room.create.post({
        mode: "group",
        passcode,
      });

      if (res.status === 200 && res.data?.roomId) {
        const secret = passcode;
        if (typeof window !== "undefined") {
          sessionStorage.setItem(`room-secret:${res.data.roomId}`, secret);
        }
        router.push(
          `/room/${res.data.roomId}?passcode=${encodeURIComponent(
            passcode
          )}&k=${encodeURIComponent(secret)}#k=${encodeURIComponent(secret)}`
        );
      }
    },
  });

  const joinError = useMemo(() => {
    if (error === "room-full") return "This room is at maximum capacity.";
    if (error === "room-not-found")
      return "This room may have expired or never existed.";
    if (error === "passcode-required")
      return "Enter the room passcode to join.";
    return null;
  }, [error]);

  const handleJoin = () => {
    if (!joinRoomId.trim() || !joinPasscode.trim()) return;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        `room-secret:${joinRoomId.trim()}`,
        joinPasscode.trim()
      );
    }
    router.push(
      `/room/${joinRoomId.trim()}?passcode=${encodeURIComponent(
        joinPasscode.trim()
      )}&k=${encodeURIComponent(joinPasscode.trim())}#k=${encodeURIComponent(
        joinPasscode.trim()
      )}`
    );
  };

  return (
    <main className="landing-gradient relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Ambient grid background */}
      <div className="ambient-grid" />

      {/* Particle animation background */}
      <ParticleBackground />

      <div className="relative z-10 w-full max-w-md space-y-8">
        {wasDestroyed && (
          <div className="glass-card border-red-900/50 p-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-red-500 text-sm font-bold">ROOM DESTROYED</p>
            <p className="text-zinc-500 text-xs mt-1">
              All messages were permanently deleted.
            </p>
          </div>
        )}
        {joinError && (
          <div className="glass-card border-red-900/50 p-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-red-500 text-sm font-bold">UNABLE TO JOIN</p>
            <p className="text-zinc-500 text-xs mt-1">{joinError}</p>
          </div>
        )}

        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <AnimatedLockIcon
              isUnlocked={false}
              className="w-12 h-12 text-green-500"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent">
            Raz
          </h1>
          <p className="text-zinc-400 text-sm">
            End-to-end encrypted chat. Messages self-destruct.
          </p>
        </div>

        <div className="glass-card pulsing-glow p-6 space-y-6">
          <div className="space-y-2">
            <label className="flex items-center text-zinc-500 text-sm uppercase tracking-wider">
              <span className="encryption-shield w-4 h-4 mr-2 text-green-500" />
              Your Identity
            </label>

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-zinc-950/50 border border-zinc-700 p-3 text-sm text-zinc-300 font-mono rounded input-focus-glow">
                {username}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <button
              onClick={() => createRoom()}
              disabled={isCreating1v1}
              className="button-smooth w-full bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 active:scale-95 shadow-lg hover:shadow-green-500/50"
            >
              {isCreating1v1 ? "Creating..." : "CREATE 1:1 ROOM"}
            </button>

            <div className="glass-card p-4 space-y-3 border-zinc-700">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold">Group room (up to 12)</span>
                <span className="text-[10px] uppercase text-zinc-600 bg-zinc-800/50 px-2 py-1 rounded">
                  Passcode required
                </span>
              </div>
              <input
                type="password"
                value={groupPasscode}
                onChange={(e) => setGroupPasscode(e.target.value)}
                placeholder="Set a passcode"
                className="w-full bg-black/50 border border-zinc-700 focus:border-green-500 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm rounded input-focus-glow"
              />
              <button
                onClick={() => createGroupRoom()}
                disabled={!groupPasscode.trim() || isCreatingGroup}
                className="button-smooth w-full bg-linear-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 active:scale-95"
              >
                {isCreatingGroup ? "Creating..." : "CREATE GROUP ROOM"}
              </button>
            </div>

            <div className="glass-card p-4 space-y-3 border-zinc-700">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold">Join existing room</span>
                <span className="text-[10px] uppercase text-zinc-600 bg-zinc-800/50 px-2 py-1 rounded">
                  Passcode needed
                </span>
              </div>
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Room ID"
                className="w-full bg-black/50 border border-zinc-700 focus:border-green-500 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm rounded input-focus-glow"
              />
              <input
                type="password"
                value={joinPasscode}
                onChange={(e) => setJoinPasscode(e.target.value)}
                placeholder="Room passcode"
                className="w-full bg-black/50 border border-zinc-700 focus:border-green-500 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm rounded input-focus-glow"
              />
              <button
                onClick={handleJoin}
                disabled={!joinRoomId.trim() || !joinPasscode.trim()}
                className="button-smooth w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 active:scale-95"
              >
                JOIN ROOM
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600">
          All messages are encrypted end-to-end and self-destruct after expiry.
        </p>
      </div>
    </main>
  );
}
