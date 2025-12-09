"use client";

import { useEffect, useState } from "react";

interface Particle {
  id: string;
  left: number;
  duration: number;
  delay: number;
  size: number;
  opacity: number;
}

export function ParticleBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Initialize particles on mount (safe pattern with empty dependency array)
    const newParticles: Particle[] = Array.from({ length: 20 }, (_, i) => ({
      id: `particle-${i}`,
      left: Math.random() * 100,
      duration: 15 + Math.random() * 10,
      delay: Math.random() * 5,
      size: 2 + Math.random() * 3,
      opacity: 0.3 + Math.random() * 0.4,
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(newParticles);
  }, []);

  return (
    <>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="particle"
          style={{
            left: `${particle.left}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            borderRadius: "50%",
            background: `rgba(34, 197, 94, ${particle.opacity})`,
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
            top: "100%",
          }}
        />
      ))}
    </>
  );
}
