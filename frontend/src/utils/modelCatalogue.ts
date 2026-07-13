// ── Types ─────────────────────────────────────────────────────────────────────

export type SpeedTier = "fast" | "medium" | "slow";

export type ModelPreset = {
  name: string;
  sizeGb: number;
  minRamGb: number;
  recRamGb: number;
  minVramGb: number;
  recVramGb: number;
  speed: SpeedTier;
  note: string;
};

export type ModelSeparator = { kind: "separator"; label: string };
export type ModelEntry = ModelPreset | ModelSeparator;

export function isSep(e: ModelEntry): e is ModelSeparator {
  return "kind" in e && (e as ModelSeparator).kind === "separator";
}

// ── Model catalogue (grouped) ─────────────────────────────────────────────────

export const MODEL_ENTRIES: ModelEntry[] = [
  // ── Meta Llama ──────────────────────────────────────────────────────────────
  { kind: "separator", label: "Meta · Llama" },
  { name: "llama3.2:1b",   sizeGb: 1.3,  minRamGb: 4,   recRamGb: 6,   minVramGb: 2,  recVramGb: 4,  speed: "fast",   note: "Smallest Llama — runs on almost anything." },
  { name: "llama3.2:3b",   sizeGb: 2.0,  minRamGb: 4,   recRamGb: 8,   minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Llama 3.2 3B — fast and compact." },
  { name: "llama3.1:8b",   sizeGb: 5.2,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "medium", note: "Good reasoning, well-rounded all-rounder." },
  { name: "llama3.3:70b",  sizeGb: 43,   minRamGb: 64,  recRamGb: 96,  minVramGb: 40, recVramGb: 48, speed: "slow",   note: "Meta's latest 70B — better than 3.1 at same size." },
  { name: "llama3.1:70b",  sizeGb: 40,   minRamGb: 64,  recRamGb: 96,  minVramGb: 40, recVramGb: 48, speed: "slow",   note: "Llama 3.1 70B — workstation / server only." },

  // ── Mistral ──────────────────────────────────────────────────────────────────
  { kind: "separator", label: "Mistral AI" },
  { name: "mistral",          sizeGb: 4.1,  minRamGb: 8,   recRamGb: 12,  minVramGb: 6,  recVramGb: 8,  speed: "fast",   note: "Mistral 7B — lightweight and reliable." },
  { name: "mistral-nemo",     sizeGb: 7.1,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "fast",   note: "Mistral Nemo 12B — extended context window." },
  { name: "mistral-small",    sizeGb: 15,   minRamGb: 24,  recRamGb: 32,  minVramGb: 16, recVramGb: 20, speed: "medium", note: "Mistral Small 22B — strong instruction following." },
  { name: "mixtral:8x7b",     sizeGb: 26,   minRamGb: 32,  recRamGb: 48,  minVramGb: 24, recVramGb: 32, speed: "slow",   note: "Mixture-of-Experts 8×7B — high quality at moderate compute." },
  { name: "mixtral:8x22b",    sizeGb: 80,   minRamGb: 128, recRamGb: 192, minVramGb: 80, recVramGb: 96, speed: "slow",   note: "Mixture-of-Experts 8×22B — near-frontier, server only." },

  // ── Google Gemma ─────────────────────────────────────────────────────────────
  { kind: "separator", label: "Google · Gemma" },
  { name: "gemma3:1b",   sizeGb: 0.8,  minRamGb: 4,   recRamGb: 6,   minVramGb: 2,  recVramGb: 4,  speed: "fast",   note: "Gemma 3 1B — newest Google model, ultra-light." },
  { name: "gemma3:4b",   sizeGb: 3.3,  minRamGb: 8,   recRamGb: 12,  minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Gemma 3 4B — excellent value for laptops." },
  { name: "gemma3:12b",  sizeGb: 8.1,  minRamGb: 16,  recRamGb: 24,  minVramGb: 8,  recVramGb: 12, speed: "medium", note: "Gemma 3 12B — strong general performance." },
  { name: "gemma3:27b",  sizeGb: 17,   minRamGb: 32,  recRamGb: 48,  minVramGb: 18, recVramGb: 24, speed: "slow",   note: "Gemma 3 27B — best Gemma, needs powerful hardware." },
  { name: "gemma2:2b",   sizeGb: 1.6,  minRamGb: 4,   recRamGb: 8,   minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Gemma 2 2B — very lightweight, ideal for low-RAM devices." },
  { name: "gemma2:9b",   sizeGb: 5.4,  minRamGb: 8,   recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "fast",   note: "Gemma 2 9B — solid all-rounder." },

  // ── Microsoft Phi ─────────────────────────────────────────────────────────────
  { kind: "separator", label: "Microsoft · Phi" },
  { name: "phi3:mini",     sizeGb: 2.3,  minRamGb: 4,   recRamGb: 8,   minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Phi-3 mini 3.8B — punches above its weight." },
  { name: "phi3.5:mini",   sizeGb: 2.2,  minRamGb: 4,   recRamGb: 8,   minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Phi-3.5 mini — updated with longer context window." },
  { name: "phi3:medium",   sizeGb: 7.9,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "fast",   note: "Phi-3 medium 14B — better reasoning than mini." },
  { name: "phi4:14b",      sizeGb: 9.1,  minRamGb: 16,  recRamGb: 24,  minVramGb: 10, recVramGb: 14, speed: "medium", note: "Phi-4 14B — Microsoft's best model yet." },

  // ── Alibaba Qwen ─────────────────────────────────────────────────────────────
  { kind: "separator", label: "Alibaba · Qwen" },
  { name: "qwen2.5:1.5b",  sizeGb: 1.0,  minRamGb: 4,   recRamGb: 6,   minVramGb: 2,  recVramGb: 4,  speed: "fast",   note: "Qwen 2.5 1.5B — smallest Qwen, edge devices." },
  { name: "qwen2.5:3b",    sizeGb: 2.0,  minRamGb: 4,   recRamGb: 8,   minVramGb: 4,  recVramGb: 6,  speed: "fast",   note: "Qwen 2.5 3B — compact and capable." },
  { name: "qwen2.5:7b",    sizeGb: 4.7,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "fast",   note: "Qwen 2.5 7B — best default quality/speed balance." },
  { name: "qwen2.5:14b",   sizeGb: 9.0,  minRamGb: 24,  recRamGb: 32,  minVramGb: 14, recVramGb: 16, speed: "medium", note: "Qwen 2.5 14B — higher quality with more compute." },
  { name: "qwen2.5:32b",   sizeGb: 20,   minRamGb: 32,  recRamGb: 48,  minVramGb: 20, recVramGb: 24, speed: "slow",   note: "Qwen 2.5 32B — strong multilingual & reasoning." },
  { name: "qwen2.5:72b",   sizeGb: 47,   minRamGb: 64,  recRamGb: 96,  minVramGb: 48, recVramGb: 64, speed: "slow",   note: "Qwen 2.5 72B — flagship, server-grade hardware." },

  // ── DeepSeek ─────────────────────────────────────────────────────────────────
  { kind: "separator", label: "DeepSeek · R1" },
  { name: "deepseek-r1:1.5b",  sizeGb: 1.1,  minRamGb: 4,   recRamGb: 6,   minVramGb: 2,  recVramGb: 4,  speed: "fast",   note: "R1 1.5B — chain-of-thought reasoning at minimal cost." },
  { name: "deepseek-r1:7b",    sizeGb: 4.7,  minRamGb: 8,   recRamGb: 16,  minVramGb: 6,  recVramGb: 10, speed: "fast",   note: "R1 7B — strong reasoning, laptop-friendly." },
  { name: "deepseek-r1:8b",    sizeGb: 5.2,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "fast",   note: "R1 8B — slightly larger, better than 7B." },
  { name: "deepseek-r1:14b",   sizeGb: 9.0,  minRamGb: 16,  recRamGb: 24,  minVramGb: 10, recVramGb: 14, speed: "medium", note: "R1 14B — excellent reasoning quality." },
  { name: "deepseek-r1:32b",   sizeGb: 20,   minRamGb: 32,  recRamGb: 48,  minVramGb: 20, recVramGb: 24, speed: "slow",   note: "R1 32B — near frontier reasoning quality." },
  { name: "deepseek-r1:70b",   sizeGb: 43,   minRamGb: 64,  recRamGb: 96,  minVramGb: 40, recVramGb: 48, speed: "slow",   note: "R1 70B — top-tier reasoning, server only." },

  // ── Code ─────────────────────────────────────────────────────────────────────
  { kind: "separator", label: "Meta · Code Llama" },
  { name: "codellama:7b",   sizeGb: 3.8,  minRamGb: 8,   recRamGb: 12,  minVramGb: 6,  recVramGb: 8,  speed: "fast",   note: "CodeLlama 7B — optimised for code tasks." },
  { name: "codellama:13b",  sizeGb: 7.4,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "medium", note: "CodeLlama 13B — better code quality." },

  // ── Vision / Multimodal ──────────────────────────────────────────────────────
  { kind: "separator", label: "Multimodal · Vision" },
  { name: "llava:7b",   sizeGb: 4.7,  minRamGb: 8,   recRamGb: 16,  minVramGb: 6,  recVramGb: 10, speed: "fast",   note: "LLaVA 7B — image + text understanding." },
  { name: "llava:13b",  sizeGb: 8.0,  minRamGb: 16,  recRamGb: 24,  minVramGb: 8,  recVramGb: 12, speed: "medium", note: "LLaVA 13B — stronger multimodal reasoning." },
  { name: "moondream:latest", sizeGb: 1.7, minRamGb: 4, recRamGb: 8, minVramGb: 4, recVramGb: 6, speed: "fast", note: "Moondream — small vision model; common first-time setup choice." },

  // ── Other ────────────────────────────────────────────────────────────────────
  { kind: "separator", label: "Other" },
  { name: "solar:10.7b",        sizeGb: 6.1,  minRamGb: 12,  recRamGb: 16,  minVramGb: 8,  recVramGb: 10, speed: "medium", note: "Upstage Solar 10.7B — strong instruction following." },
  { name: "nomic-embed-text",   sizeGb: 0.3,  minRamGb: 2,   recRamGb: 4,   minVramGb: 0,  recVramGb: 2,  speed: "fast",   note: "Embedding-only model — not for chat, use for RAG/search." },
];

/** Flat list of models only (no separators) — used for logic, recommendations, etc. */
export const MODEL_PRESETS: ModelPreset[] = MODEL_ENTRIES.filter(
  (e): e is ModelPreset => !isSep(e)
);

/**
 * Strip the `:latest` suffix Ollama appends when no tag is given.
 * e.g. "mistral:latest" → "mistral", "llama3.2:3b" stays "llama3.2:3b"
 */
export function normalizeModel(name: string): string {
  return name.endsWith(":latest") ? name.slice(0, -7) : name;
}

/** Find the preset entry for a model name, tolerating the `:latest` suffix. */
export function findPreset(name: string): ModelPreset | undefined {
  return (
    MODEL_PRESETS.find((m) => m.name === name) ??
    MODEL_PRESETS.find((m) => m.name === normalizeModel(name))
  );
}

/** Installed / download tables: compact min–recommended system RAM (GB). */
export function formatPresetRamRange(preset: ModelPreset | undefined): string {
  if (!preset) return "—";
  if (preset.minRamGb === preset.recRamGb) return `${preset.minRamGb} GB`;
  return `${preset.minRamGb}–${preset.recRamGb} GB`;
}

/** Tooltip for RAM cells — distinguishes from on-disk model size. */
export function presetRamRangeTitle(preset: ModelPreset | undefined): string | undefined {
  if (!preset) return undefined;
  return `System RAM (not disk): about ${preset.minRamGb} GB minimum, ${preset.recRamGb} GB recommended.`;
}
