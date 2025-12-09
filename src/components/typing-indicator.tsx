"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 p-3">
      <span className="text-xs text-zinc-500 mr-2">Someone is typing</span>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
    </div>
  );
}
