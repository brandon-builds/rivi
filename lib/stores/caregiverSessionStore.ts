const STARTED_AT_KEY = "rivi_session_started_at";
const COMPLETED_STEP_IDS_KEY = "rivi_completed_step_ids";
const TOTAL_STEP_IDS_KEY = "rivi_total_step_ids";
const COMPLETED_AT_KEY = "rivi_session_completed_at";

type CaregiverSession = {
  startedAt: string;
  completedAt?: string;
  completedStepIds: string[];
  totalStepIds: string[];
};

const readJsonArray = (value: string | null): string[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const load = (): CaregiverSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const startedAt = sessionStorage.getItem(STARTED_AT_KEY);
  if (!startedAt) {
    return null;
  }

  return {
    startedAt,
    completedAt: sessionStorage.getItem(COMPLETED_AT_KEY) ?? undefined,
    completedStepIds: readJsonArray(sessionStorage.getItem(COMPLETED_STEP_IDS_KEY)),
    totalStepIds: readJsonArray(sessionStorage.getItem(TOTAL_STEP_IDS_KEY))
  };
};

const save = (session: CaregiverSession): void => {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(STARTED_AT_KEY, session.startedAt);
  sessionStorage.setItem(COMPLETED_STEP_IDS_KEY, JSON.stringify(session.completedStepIds));
  sessionStorage.setItem(TOTAL_STEP_IDS_KEY, JSON.stringify(session.totalStepIds));

  if (session.completedAt) {
    sessionStorage.setItem(COMPLETED_AT_KEY, session.completedAt);
  } else {
    sessionStorage.removeItem(COMPLETED_AT_KEY);
  }
};

export const CaregiverSessionStore = {
  begin(totalStepIds: string[]): CaregiverSession {
    const session: CaregiverSession = {
      startedAt: new Date().toISOString(),
      completedStepIds: [],
      totalStepIds
    };

    save(session);
    return session;
  },

  load(): CaregiverSession | null {
    return load();
  },

  markCompleted(stepId: string): CaregiverSession {
    const current = load();
    if (!current) {
      return this.begin([]);
    }

    if (current.completedStepIds.includes(stepId)) {
      return current;
    }

    const next: CaregiverSession = {
      ...current,
      completedStepIds: [...current.completedStepIds, stepId]
    };

    save(next);
    return next;
  },

  finish(timestampIso: string): CaregiverSession {
    const current = load();
    if (!current) {
      const next: CaregiverSession = {
        startedAt: new Date().toISOString(),
        completedStepIds: [],
        totalStepIds: [],
        completedAt: timestampIso
      };

      save(next);
      return next;
    }

    const next: CaregiverSession = {
      ...current,
      completedAt: timestampIso
    };

    save(next);
    return next;
  },

  clear(): void {
    if (typeof window === "undefined") {
      return;
    }

    sessionStorage.removeItem(STARTED_AT_KEY);
    sessionStorage.removeItem(COMPLETED_STEP_IDS_KEY);
    sessionStorage.removeItem(TOTAL_STEP_IDS_KEY);
    sessionStorage.removeItem(COMPLETED_AT_KEY);
  }
};

export type { CaregiverSession };
