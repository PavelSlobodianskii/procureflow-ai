/**
 * Little celebration pieces for the "draft saved" moment. Decorative only (aria-hidden).
 * They sit in the top and bottom margins of the banner and drift gently, so they never cross the text.
 */
const PIECES = [
  { left: "4%", top: "8%", color: "#f472b6", shape: "dot", delay: "0s", size: 8 },
  { left: "13%", top: "82%", color: "#fbbf24", shape: "bar", delay: "0.4s", size: 10 },
  { left: "22%", top: "6%", color: "#34d399", shape: "diamond", delay: "0.9s", size: 9 },
  { left: "31%", top: "84%", color: "#60a5fa", shape: "dot", delay: "1.3s", size: 7 },
  { left: "41%", top: "7%", color: "#a78bfa", shape: "bar", delay: "0.2s", size: 11 },
  { left: "50%", top: "86%", color: "#fb7185", shape: "diamond", delay: "1.6s", size: 8 },
  { left: "59%", top: "6%", color: "#fbbf24", shape: "dot", delay: "0.7s", size: 9 },
  { left: "67%", top: "83%", color: "#34d399", shape: "bar", delay: "1.1s", size: 10 },
  { left: "76%", top: "9%", color: "#f472b6", shape: "diamond", delay: "0.5s", size: 8 },
  { left: "85%", top: "85%", color: "#60a5fa", shape: "bar", delay: "1.8s", size: 9 },
  { left: "93%", top: "7%", color: "#a78bfa", shape: "dot", delay: "1s", size: 8 },
  { left: "96%", top: "80%", color: "#fbbf24", shape: "diamond", delay: "0.3s", size: 7 },
] as const;

export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className="motion-confetti absolute block"
          style={{
            left: piece.left,
            top: piece.top,
            width: piece.shape === "bar" ? piece.size * 0.55 : piece.size,
            height: piece.shape === "bar" ? piece.size * 1.5 : piece.size,
            background: piece.color,
            borderRadius: piece.shape === "dot" ? "9999px" : piece.shape === "bar" ? "2px" : "1px",
            animationDelay: piece.delay,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}
