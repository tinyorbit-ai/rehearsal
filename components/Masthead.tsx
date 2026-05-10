type View = "setup" | "recording" | "analysis";

const viewLabel: Record<View, string> = {
  setup: "PREPARATION",
  recording: "ON AIR",
  analysis: "DELIVERY REVIEW",
};

export function Masthead({ view }: { view: View }) {
  const issueDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="relative z-10 border-b rule">
      <div className="mx-auto max-w-[1240px] px-6 pt-6 pb-4">
        <div className="flex items-baseline justify-between gap-6">
          <div className="reveal reveal-1">
            <div className="kicker flex items-center gap-3">
              <span>Interview prep</span>
              <span className="h-px w-6 bg-[var(--color-paper-3)]/50" />
              <span className="tnum">{issueDate}</span>
            </div>
            <h1 className="mt-1 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-[var(--color-paper)]">
              The Rehearsal
            </h1>
            <p className="mt-1 text-[14px] text-[var(--color-paper-2)]">
              Rehearse your interview. Hone your delivery.
            </p>
          </div>

          <div className="hidden md:flex items-baseline gap-6 reveal reveal-2">
            <div className="text-right">
              <div className="kicker">Section</div>
              <div className="text-xl font-semibold leading-tight mt-0.5">
                {viewLabel[view]}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
