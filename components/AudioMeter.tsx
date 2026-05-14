"use client";

export function AudioMeter({
  rms,
  label = "Mic",
  bars = 12,
}: {
  rms: number;
  label?: string;
  bars?: number;
}) {
  const level = Math.min(1, Math.max(0, rms / 0.25));
  const lit = Math.round(level * bars);
  return (
    <span className="flex items-center gap-2 shrink-0">
      <span>{label}</span>
      <span className="flex items-end gap-[2px] h-3">
        {Array.from({ length: bars }, (_, i) => {
          const isLit = i < lit;
          const color =
            i < bars * 0.5
              ? "var(--color-brass)"
              : i < bars * 0.85
                ? "var(--color-paper)"
                : "var(--color-oxblood)";
          return (
            <span
              key={i}
              className="w-[3px] rounded-[1px]"
              style={{
                height: `${30 + i * 6}%`,
                background: isLit ? color : "var(--color-ink-2)",
                transition: "background 80ms linear",
              }}
            />
          );
        })}
      </span>
    </span>
  );
}
