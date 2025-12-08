"use client"

import { useUsername } from "@/hooks/use-username"
import { client } from "@/lib/client"
import { useMutation } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

const Page = () => {
  return (
    <Suspense>
      <Lobby />
    </Suspense>
  )
}

export default Page

function Lobby() {
  const { username } = useUsername()
  const router = useRouter()

  const searchParams = useSearchParams()
  const wasDestroyed = searchParams.get("destroyed") === "true"
  const error = searchParams.get("error")
  const roomFromParams = searchParams.get("room") ?? ""

  const [groupPasscode, setGroupPasscode] = useState("")
  const [joinRoomId, setJoinRoomId] = useState(roomFromParams)
  const [joinPasscode, setJoinPasscode] = useState("")

  const { mutate: createRoom } = useMutation({
    mutationFn: async () => {
      const res = await client.room.create.post({ mode: "pair" })

      if (res.status === 200) {
        router.push(`/room/${res.data?.roomId}`)
      }
    },
  })

  const { mutate: createGroupRoom, isPending: isCreatingGroup } = useMutation({
    mutationFn: async () => {
      const passcode = groupPasscode.trim()
      if (!passcode) throw new Error("Passcode is required")

      const res = await client.room.create.post({
        mode: "group",
        passcode,
      })

      if (res.status === 200 && res.data?.roomId) {
        router.push(`/room/${res.data.roomId}?passcode=${encodeURIComponent(passcode)}`)
      }
    },
  })

  const joinError = useMemo(() => {
    if (error === "room-full") return "This room is at maximum capacity."
    if (error === "room-not-found") return "This room may have expired or never existed."
    if (error === "passcode-required") return "Enter the room passcode to join."
    return null
  }, [error])

  const handleJoin = () => {
    if (!joinRoomId.trim() || !joinPasscode.trim()) return
    router.push(`/room/${joinRoomId.trim()}?passcode=${encodeURIComponent(joinPasscode.trim())}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {wasDestroyed && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM DESTROYED</p>
            <p className="text-zinc-500 text-xs mt-1">
              All messages were permanently deleted.
            </p>
          </div>
        )}
        {joinError && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">UNABLE TO JOIN</p>
            <p className="text-zinc-500 text-xs mt-1">{joinError}</p>
          </div>
        )}

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-green-500">
            {">"}private_chat
          </h1>
          <p className="text-zinc-500 text-sm">A private, self-destructing chat room.</p>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-4">
          <div className="space-y-2">
            <label className="flex items-center text-zinc-500">Your Identity</label>

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono">
                {username}
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <button
              onClick={() => createRoom()}
              className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:bg-zinc-50 hover:text-black transition-colors mt-2 cursor-pointer disabled:opacity-50"
            >
              CREATE 1:1 ROOM
            </button>

            <div className="border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Create group room (up to 12)</span>
                <span className="text-[10px] uppercase text-zinc-600">Passcode required</span>
              </div>
              <input
                type="password"
                value={groupPasscode}
                onChange={(e) => setGroupPasscode(e.target.value)}
                placeholder="Set a passcode"
                className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm"
              />
              <button
                onClick={() => createGroupRoom()}
                disabled={!groupPasscode.trim() || isCreatingGroup}
                className="w-full bg-purple-600 text-white p-2 text-sm font-bold hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                CREATE GROUP ROOM
              </button>
            </div>

            <div className="border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Join room</span>
                <span className="text-[10px] uppercase text-zinc-600">Passcode needed</span>
              </div>
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Room ID"
                className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm"
              />
              <input
                type="password"
                value={joinPasscode}
                onChange={(e) => setJoinPasscode(e.target.value)}
                placeholder="Room passcode"
                className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-2 px-3 text-sm"
              />
              <button
                onClick={handleJoin}
                disabled={!joinRoomId.trim() || !joinPasscode.trim()}
                className="w-full bg-zinc-100 text-black p-2 text-sm font-bold hover:bg-zinc-50 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
              >
                JOIN ROOM
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
