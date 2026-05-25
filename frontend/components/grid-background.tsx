'use client';

import React, { useMemo } from 'react';

export const GridBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Base Grid */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(var(--accent-color), 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(var(--accent-color), 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black, transparent 80%)'
        }}
      />

      {/* Perspective Mesh */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(var(--accent-color), 0.2) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(var(--accent-color), 0.2) 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px)',
          transformOrigin: 'top',
          height: '200%'
        }}
      />

      {/* Pulsing Dots */}
      <div className="absolute inset-0 scanlines opacity-30" />
      
      {/* Vignette & Glows */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#000b1a] via-transparent to-[#000b1a] opacity-60" />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] blur-[120px] rounded-full opacity-30"
        style={{ backgroundColor: 'rgba(var(--accent-color), 0.15)' }}
      />
    </div>
  );
};
