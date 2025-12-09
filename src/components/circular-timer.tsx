"use client";

import { useMemo } from "react";

interface CircularTimerProps {
  timeRemaining: number | null;
  totalTime: number;
}

export function CircularTimer({
  timeRemaining,
  totalTime,
}: CircularTimerProps) {
  const percentage = useMemo(() => {
    if (timeRemaining === null || totalTime === 0) return 0;
    return ((totalTime - timeRemaining) / totalTime) * 100;
  }, [timeRemaining, totalTime]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative w-20 h-20">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
        {/* Background ring */}
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="2"
        />
        {/* Progress ring with gradient */}
        <defs>
          <linearGradient
            id="timerGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="rgba(34, 197, 94, 0.8)" />
            <stop offset="50%" stopColor="rgba(250, 204, 21, 0.8)" />
            <stop offset="100%" stopColor="rgba(239, 68, 68, 0.8)" />
          </linearGradient>
        </defs>
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="url(#timerGradient)"
          strokeWidth="2"
          strokeDasharray={`${2 * Math.PI * 36}`}
          strokeDashoffset={`${2 * Math.PI * 36 * (1 - percentage / 100)}`}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1s linear",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-bold text-green-500 font-mono">
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>
    </div>
  );
}
