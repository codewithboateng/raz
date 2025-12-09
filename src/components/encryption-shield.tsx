"use client";

interface EncryptionShieldProps {
  className?: string;
}

export function EncryptionShield({ className = "" }: EncryptionShieldProps) {
  return (
    <svg
      className={`encryption-shield ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      <path d="M9 12l2 2 4-4" strokeWidth="2.5"></path>
    </svg>
  );
}
