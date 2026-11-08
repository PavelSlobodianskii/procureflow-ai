export type MascotMood = "happy" | "thinking" | "oops" | "cheer";

const INK = "#1e1b4b";

/**
 * A small friendly robot helper. Its face follows what the form is doing:
 * happy (waiting for you), thinking (sending), oops (something went wrong), cheer (draft saved).
 * Purely decorative: hidden from screen readers, which get the real status messages instead.
 * Animations (blinking, waving) switch off automatically for people who prefer reduced motion.
 */
export function Mascot({ mood, className }: { mood: MascotMood; className?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false" className={className}>
      {/* antenna */}
      <path d="M48 24V15" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="11" r="4.5" fill="#fbbf24" className="svg-box motion-twinkle" />

      {/* arms (behind the head) */}
      {mood === "cheer" ? (
        <>
          <path d="M30 82 18 62" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" className="svg-box motion-wave" />
          <path d="M66 82 78 62" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" className="svg-box motion-wave" />
        </>
      ) : (
        <>
          <path d="M30 82 19 88" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" />
          {mood === "happy" ? (
            <path d="M66 82 79 70" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" className="svg-box motion-wave" />
          ) : (
            <path d="M66 82 77 88" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" />
          )}
        </>
      )}

      {/* body */}
      <rect x="30" y="72" width="36" height="18" rx="9" fill="#4f46e5" />
      <circle cx="48" cy="81" r="3" fill="#a5b4fc" />

      {/* ears + head */}
      <rect x="9" y="39" width="8" height="16" rx="4" fill="#818cf8" />
      <rect x="79" y="39" width="8" height="16" rx="4" fill="#818cf8" />
      <rect x="14" y="22" width="68" height="52" rx="20" fill="#6366f1" />
      <rect x="20" y="28" width="56" height="40" rx="15" fill="#eef2ff" />

      {/* eyes */}
      <g className="svg-box motion-blink">
        <ellipse cx="37" cy="46" rx="5.5" ry="6.5" fill={INK} />
        <ellipse cx="59" cy="46" rx="5.5" ry="6.5" fill={INK} />
        <circle cx="39" cy="43.5" r="1.8" fill="#ffffff" />
        <circle cx="61" cy="43.5" r="1.8" fill="#ffffff" />
      </g>

      {/* cheeks */}
      <circle cx="28.5" cy="57" r="4" fill="#f9a8d4" opacity="0.85" />
      <circle cx="67.5" cy="57" r="4" fill="#f9a8d4" opacity="0.85" />

      {/* mouth, by mood */}
      {mood === "happy" && <path d="M41 56.5q7 7 14 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      {mood === "cheer" && (
        <>
          <path d="M40 55h16q-1 11-8 11t-8-11z" fill={INK} />
          <path d="M44 62.5q4 3 8 0" fill="none" stroke="#fb7185" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {mood === "thinking" && (
        <>
          <circle cx="48" cy="59" r="3" fill="none" stroke={INK} strokeWidth="2.6" />
          <circle cx="76" cy="20" r="2.2" fill="#a5b4fc" className="svg-box motion-twinkle" />
          <circle cx="82" cy="12" r="3.2" fill="#a5b4fc" className="svg-box motion-twinkle" style={{ animationDelay: "0.4s" }} />
          <circle cx="89" cy="3.5" r="4.2" fill="#a5b4fc" className="svg-box motion-twinkle" style={{ animationDelay: "0.8s" }} />
        </>
      )}
      {mood === "oops" && (
        <>
          <path d="M40.5 60q3.5-4.5 7.5 0t7.5 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M73 28c3 4 4.5 6.5 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2 1.5-4.5 4.5-8.5z" fill="#7dd3fc" />
        </>
      )}
    </svg>
  );
}
