import { RunRecord } from "./types";

export async function hashContext(contextString: string): Promise<string> {
  const normalised = contextString.trim().replace(/\s+/g, " ").toLowerCase();
  const encoded = new TextEncoder().encode(normalised);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

export function computeDriftFlags(currentRun: Partial<RunRecord>, contextHistory: RunRecord[]): string[] {
  if (contextHistory.length < 2) return [];
  
  const baseline = contextHistory.slice(0, 5);
  const avg = (key: keyof RunRecord) => baseline.reduce((s, r) => s + (r[key] as number), 0) / baseline.length;
  const flags: string[] = [];

  if (avg("groundedness_score") - (currentRun.groundedness_score || 0) > 10)
    flags.push("GROUNDEDNESS_REGRESSION");

  if ((currentRun.hallucination_rate || 0) - avg("hallucination_rate") > 15)
    flags.push("HALLUCINATION_SPIKE");

  if (avg("relevance_score") - (currentRun.relevance_score || 0) > 10)
    flags.push("RELEVANCE_REGRESSION");

  if ((currentRun.fabricated_claims || 0) > 0 && baseline.every(r => r.fabricated_claims === 0))
    flags.push("FABRICATION_INTRODUCED");

  const prevActions = baseline.slice(0, 3).map(r => r.recommended_action);
  const allSame = prevActions.every(a => a === prevActions[0]);
  if (allSame && currentRun.recommended_action !== prevActions[0])
    flags.push("ACTION_INSTABILITY");

  return flags;
}

const RUN_HISTORY_KEY = "veritas_run_history";
const MAX_RUNS = 50;

export function saveRun(runRecord: RunRecord) {
  const history = loadHistory();
  history.unshift(runRecord);
  if (history.length > MAX_RUNS) history.pop();
  localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
}

export function loadHistory(): RunRecord[] {
  try {
    const data = localStorage.getItem(RUN_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getRunsForContext(contextHash: string): RunRecord[] {
  return loadHistory().filter(r => r.context_hash === contextHash);
}
