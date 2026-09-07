export type RuntimeMode = "offline" | "online";

export type RuntimeStatus = {
  mode: RuntimeMode;
  model: "local";
  offline: true;
  deterministic: true;
  gemini: {
    enabled: false;
    reason: string;
  };
};

/** The control plane is local. Gemini is optional and never required. */
export function runtimeStatus(): RuntimeStatus {
  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  return {
    mode: "offline",
    model: "local",
    offline: true,
    deterministic: true,
    gemini: {
      enabled: false,
      reason: hasKey
        ? "A Gemini key is present, but this orchestrator stays local. It does not call Gemini, so it still works with no internet."
        : "No Gemini key. Task understanding, routing, specialists, and local RAG all run on this machine.",
    },
  };
}
