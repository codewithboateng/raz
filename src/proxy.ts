import { NextRequest, NextResponse } from "next/server"
import { redis } from "./lib/redis"
import { nanoid } from "nanoid"
import { realtime } from "./lib/realtime"

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/)
  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url))

  const roomId = roomMatch[1]

  const meta = await redis.hgetall<{
    connected: string[]
    createdAt: number
    mode?: "pair" | "group"
    passcode?: string
    ownerToken?: string
    master?: string
  }>(`meta:${roomId}`)

  if (!meta) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url))
  }

  const existingToken = req.cookies.get("x-auth-token")?.value
  const connected = meta.connected ?? []

  // USER IS ALLOWED TO JOIN ROOM
  if (existingToken && connected.includes(existingToken)) {
    return NextResponse.next()
  }

  // USER IS NOT ALLOWED TO JOIN
  const isMaster = meta.master === "true"
  const capacity = meta.mode === "group" ? 12 : 2
  if (!isMaster && connected.length >= capacity) {
    return NextResponse.redirect(new URL("/?error=room-full", req.url))
  }

  if (meta.mode === "group" && meta.passcode) {
    const providedPasscode = req.nextUrl.searchParams.get("passcode")
    if (providedPasscode !== meta.passcode) {
      const url = new URL("/", req.url)
      url.searchParams.set("error", "passcode-required")
      url.searchParams.set("room", roomId)
      return NextResponse.redirect(url)
    }
  }

  const response = NextResponse.next()

  const token = nanoid()

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  })

  await redis.hset(`meta:${roomId}`, {
    connected: [...connected, token],
    ownerToken: meta.ownerToken ?? token,
  })

  await realtime
    .channel(roomId)
    .emit("chat.participants", { count: connected.length + 1 })

  return response
}

export const config = {
  matcher: "/room/:path*",
}
