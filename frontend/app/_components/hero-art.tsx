/**
 * Decorative artwork for the hero band: a draft card with a check badge, a stack of coins and a few
 * twinkling sparkles. Hidden from screen readers. Floating and twinkling stop for reduced motion.
 */
function Sparkle({ x, y, size, delay }: { x: number; y: number; size: number; delay: string }) {
  const s = size;
  return (
    <path
      d={`M${x} ${y - s}q${s * 0.2} ${s * 0.8} ${s} ${s}q${-s * 0.8} ${s * 0.2} ${-s} ${s}q${-s * 0.2} ${-s * 0.8} ${-s} ${-s}q${s * 0.8} ${-s * 0.2} ${s} ${-s}z`}
      fill="#ffffff"
      className="svg-box motion-twinkle"
      style={{ animationDelay: delay }}
    />
  );
}

export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 190" aria-hidden="true" focusable="false" className={className}>
      <circle cx="52" cy="40" r="3" fill="#ffffff" opacity="0.5" />
      <circle cx="214" cy="92" r="4" fill="#ffffff" opacity="0.35" />
      <circle cx="26" cy="132" r="5" fill="#5eead4" opacity="0.6" />
      <Sparkle x={30} y={78} size={7} delay="0s" />
      <Sparkle x={206} y={30} size={9} delay="0.9s" />
      <Sparkle x={120} y={10} size={5} delay="1.6s" />

      {/* the draft card */}
      <g className="svg-box motion-float">
        <rect x="52" y="26" width="118" height="140" rx="16" fill="#000000" opacity="0.14" transform="translate(4 6)" />
        <rect x="52" y="26" width="118" height="140" rx="16" fill="#ffffff" />
        <rect x="52" y="26" width="118" height="30" rx="16" fill="#e0e7ff" />
        <rect x="52" y="42" width="118" height="14" fill="#e0e7ff" />
        <circle cx="70" cy="41" r="6" fill="#6366f1" />
        <rect x="82" y="37" width="52" height="8" rx="4" fill="#a5b4fc" />
        <rect x="68" y="70" width="86" height="8" rx="4" fill="#e2e8f0" />
        <rect x="68" y="86" width="70" height="8" rx="4" fill="#e2e8f0" />
        <rect x="68" y="102" width="78" height="8" rx="4" fill="#e2e8f0" />
        <rect x="68" y="126" width="64" height="22" rx="11" fill="#99f6e4" />
        <circle cx="79" cy="137" r="5" fill="#0f766e" />
        <rect x="90" y="133" width="30" height="8" rx="4" fill="#0f766e" opacity="0.55" />
        {/* check badge */}
        <circle cx="168" cy="34" r="17" fill="#10b981" />
        <path d="m160 34 5.5 5.5L177 27.5" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* coins */}
      <g className="svg-box motion-float-slow">
        <ellipse cx="190" cy="168" rx="26" ry="9" fill="#d97706" />
        <rect x="164" y="156" width="52" height="12" fill="#f59e0b" />
        <ellipse cx="190" cy="156" rx="26" ry="9" fill="#fbbf24" />
        <ellipse cx="190" cy="144" rx="26" ry="9" fill="#d97706" />
        <rect x="164" y="132" width="52" height="12" fill="#f59e0b" />
        <ellipse cx="190" cy="132" rx="26" ry="9" fill="#fcd34d" />
        <ellipse cx="190" cy="131" rx="14" ry="4.5" fill="none" stroke="#f59e0b" strokeWidth="2" />
      </g>
    </svg>
  );
}
