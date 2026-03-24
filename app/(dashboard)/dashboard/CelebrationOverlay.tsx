"use client";
import { useEffect, useState, useCallback } from "react";

interface CelebrationOverlayProps {
  message: string;
  subMessage?: string;
  onDismiss: () => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  type: "confetti" | "balloon";
  rotation: number;
}

const COLORS = [
  "#f43f5e", "#ec4899", "#a855f7", "#6366f1", "#3b82f6",
  "#06b6d4", "#10b981", "#84cc16", "#eab308", "#f97316",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f59e0b", "#22d3ee",
];

const BALLOON_COLORS = [
  "#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7",
  "#ec4899", "#f97316", "#06b6d4",
];

export default function CelebrationOverlay({ message, subMessage, onDismiss }: CelebrationOverlayProps) {
  const [particles] = useState<Particle[]>(() => {
    const confetti: Particle[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 1.2,
      duration: 2 + Math.random() * 2,
      type: "confetti" as const,
      rotation: Math.random() * 360,
    }));
    const balloons: Particle[] = Array.from({ length: 10 }, (_, i) => ({
      id: 100 + i,
      x: 5 + Math.random() * 90,
      y: 110 + Math.random() * 20,
      color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      size: 32 + Math.random() * 18,
      delay: Math.random() * 0.8,
      duration: 3 + Math.random() * 2,
      type: "balloon" as const,
      rotation: -15 + Math.random() * 30,
    }));
    return [...confetti, ...balloons];
  });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 500);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleClick = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 500);
  }, [onDismiss]);

  return (
    <div
      onClick={handleClick}
      className={`fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.7) 100%)" }}
    >
      {/* Confetti particles */}
      {particles
        .filter((p) => p.type === "confetti")
        .map((p) => (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: "2px",
              transform: `rotate(${p.rotation}deg)`,
              animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
              opacity: 0,
            }}
          />
        ))}

      {/* Balloon particles */}
      {particles
        .filter((p) => p.type === "balloon")
        .map((p) => (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              bottom: `-${p.size + 20}px`,
              animation: `balloonRise ${p.duration}s ${p.delay}s ease-out forwards`,
              opacity: 0,
            }}
          >
            <svg
              width={p.size}
              height={p.size * 1.5}
              viewBox="0 0 40 60"
              style={{ transform: `rotate(${p.rotation}deg)`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))" }}
            >
              <ellipse cx="20" cy="22" rx="16" ry="20" fill={p.color} opacity="0.9" />
              <ellipse cx="20" cy="22" rx="16" ry="20" fill="url(#shine)" opacity="0.3" />
              <polygon points="16,40 20,44 24,40" fill={p.color} opacity="0.8" />
              <line x1="20" y1="44" x2="20" y2="60" stroke={p.color} strokeWidth="0.8" opacity="0.5" />
              <defs>
                <radialGradient id="shine" cx="35%" cy="30%" r="50%">
                  <stop offset="0%" stopColor="white" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
            </svg>
          </div>
        ))}

      {/* Center message */}
      <div
        className="relative z-10 text-center px-8 py-6"
        style={{ animation: "celebrationPop 0.6s 0.2s ease-out both" }}
      >
        <div className="text-6xl mb-3" style={{ animation: "celebrationBounce 1s 0.4s ease-in-out infinite" }}>
          🎉
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 drop-shadow-lg">
          {message}
        </h1>
        {subMessage && (
          <p className="text-base sm:text-lg text-white/80 font-medium max-w-md mx-auto">
            {subMessage}
          </p>
        )}
        <p className="text-xs text-white/40 mt-4">Click anywhere to dismiss</p>
      </div>

      <style jsx>{`
        @keyframes confettiFall {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(100vh) rotate(720deg); }
        }
        @keyframes balloonRise {
          0% { opacity: 0.9; transform: translateY(0); }
          70% { opacity: 0.9; }
          100% { opacity: 0; transform: translateY(-120vh); }
        }
        @keyframes celebrationPop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebrationBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
