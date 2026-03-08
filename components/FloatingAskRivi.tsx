"use client";

type FloatingAskRiviProps = {
  state: "idle" | "connecting" | "listening" | "speaking" | "error";
  onTap: () => void;
  disabled?: boolean;
  visible?: boolean;
};

export function FloatingAskRivi({ state, onTap, disabled, visible = true }: FloatingAskRiviProps) {
  if (!visible) {
    return null;
  }

  const stateClass =
    state === "listening"
      ? "guidance-fab-listening"
      : state === "connecting"
        ? "guidance-fab-connecting"
        : state === "speaking"
          ? "guidance-fab-speaking"
          : state === "error"
            ? "guidance-fab-error"
            : "";

  return (
    <div className="guidance-fab-wrap">
      <button
        type="button"
        className={`guidance-fab ${stateClass}`}
        onClick={onTap}
        disabled={disabled}
        aria-label="Ask Rivi"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" fill="currentColor" />
          <path d="M18 11.5a6 6 0 0 1-12 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M12 17.5V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <p className="guidance-fab-label">Ask Rivi</p>
    </div>
  );
}
