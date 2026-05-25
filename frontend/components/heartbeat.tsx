'use client';

import { motion } from 'framer-motion';

export function Heartbeat() {
  return (
    <div className="flex items-center gap-3 bg-white/[0.02] p-2 rounded-xl ring-1 ring-white/5 backdrop-blur-md">
      <div className="flex flex-col">
        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-cyan-500/50">AI Heartbeat</span>
        <span className="text-[10px] font-bold text-white/90">LIFE SIGN: ACTIVE</span>
      </div>
      <div className="relative h-8 w-24 overflow-hidden">
        <svg viewBox="0 0 100 40" className="h-full w-full">
          <motion.path
            d="M 0 20 Q 5 20 10 20 T 20 20 T 30 20 T 35 20 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20"
            initial={{ d: "M 0 20 Q 5 20 10 20 T 20 20 T 30 20 T 35 20 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20" }}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            animate={{
              d: [
                "M 0 20 Q 5 20 10 20 T 20 20 T 30 20 T 35 20 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20",
                "M 0 20 Q 5 20 10 20 T 20 20 T 30 10 T 35 30 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20",
                "M 0 20 Q 5 20 10 20 T 20 20 T 30 20 T 35 20 T 40 20 T 50 20 T 60 20 T 70 20 T 80 20 T 90 20 T 100 20"
              ]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          {/* Subtle Glow Trail */}
          <motion.circle
            r="2"
            fill="#22d3ee"
            cx="0"
            initial={{ cx: 0 }}
            animate={{
              cx: [0, 100]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear"
            }}
            cy="20"
            className="blur-[1px]"
          />
        </svg>
      </div>
    </div>
  );
}
