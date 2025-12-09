"use client";

import { useState, useEffect } from "react";

interface AnimatedLockIconProps {
  isUnlocked?: boolean;
  className?: string;
}

export function AnimatedLockIcon({
  isUnlocked = false,
  className = "",
}: AnimatedLockIconProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    setShouldAnimate(isUnlocked);
  }, [isUnlocked]);

  return (
    <svg
      className={`${shouldAnimate ? "lock-icon-unlock" : ""} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {isUnlocked ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          <circle cx="12" cy="16" r="1"></circle>
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.2 1"></path>
          <circle cx="12" cy="16" r="1"></circle>
        </>
      )}
    </svg>
  );
}
