'use client';

import { useState } from 'react';

/**
 * Kleecks mark.
 *
 * Drop the white logo into `public/kleecks-logo.png` and it is used everywhere;
 * until then this falls back to the wordmark set in type, so nothing ever
 * renders as a broken image.
 */
export default function Logo({ className, height }: { className?: string; height: number }) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <span
        className={`wordmark ${className ?? ''}`}
        style={{ fontSize: Math.round(height * 0.55) }}
        aria-label="Kleecks"
      >
        KLEECKS
      </span>
    );
  }

  return (
    <img
      className={className}
      src="/kleecks-logo.png"
      alt="Kleecks"
      style={{ height, width: 'auto' }}
      onError={() => setMissing(true)}
    />
  );
}
