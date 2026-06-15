export type PracticeSessionRecord = {
  session_id: string;
  mode: string;
  active_agent: string;
  distress_before: number;
  distress_after: number | null;
  distress_delta: "better" | "same" | "worse" | null;
  max_intensity: string;
  risk_signal: string;
  stop_triggered: boolean;
  practice_rounds: number;
  debrief_takeaway: string | null;
  villain_persona: string;
  started_at: string;
  ended_at: string | null;
};

const STORAGE_KEY = "neverland_practice_sessions";
const CURRENT_KEY = "neverland_current_session";

function readAll(): PracticeSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PracticeSessionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: PracticeSessionRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 20)));
}

export function createSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function startPracticeSession(input: {
  distress_before: number;
  max_intensity: string;
  villain_persona: string;
}): PracticeSessionRecord {
  const record: PracticeSessionRecord = {
    session_id: createSessionId(),
    mode: "PRACTICE_RUNNING",
    active_agent: "villain",
    distress_before: input.distress_before,
    distress_after: null,
    distress_delta: null,
    max_intensity: input.max_intensity,
    risk_signal: "continue",
    stop_triggered: false,
    practice_rounds: 0,
    debrief_takeaway: null,
    villain_persona: input.villain_persona,
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(CURRENT_KEY, record.session_id);
  }
  const all = readAll();
  writeAll([record, ...all]);
  return record;
}

export function getCurrentSession(): PracticeSessionRecord | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(CURRENT_KEY);
  if (!id) return null;
  return readAll().find((r) => r.session_id === id) ?? null;
}

export function updateCurrentSession(
  patch: Partial<PracticeSessionRecord>,
): PracticeSessionRecord | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(CURRENT_KEY);
  if (!id) return null;
  const all = readAll();
  const index = all.findIndex((r) => r.session_id === id);
  if (index < 0) return null;
  all[index] = { ...all[index], ...patch };
  writeAll(all);
  return all[index];
}

export function endPracticeSession(input: {
  distress_after: number;
  distress_delta: "better" | "same" | "worse";
  debrief_takeaway?: string | null;
  stop_triggered?: boolean;
  practice_rounds: number;
  risk_signal: string;
  mode?: string;
}): PracticeSessionRecord | null {
  return updateCurrentSession({
    distress_after: input.distress_after,
    distress_delta: input.distress_delta,
    debrief_takeaway: input.debrief_takeaway ?? null,
    stop_triggered: input.stop_triggered ?? false,
    practice_rounds: input.practice_rounds,
    risk_signal: input.risk_signal,
    mode: input.mode ?? "PRACTICE_ENDED",
    active_agent: "shield",
    ended_at: new Date().toISOString(),
  });
}

export function listRecentSessions(limit = 5): PracticeSessionRecord[] {
  return readAll().slice(0, limit);
}
