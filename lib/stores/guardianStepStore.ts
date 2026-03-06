import { GuardianStep } from "@/lib/types";

const STEP_KEY = "guardian_steps_v1";
const MAX_PERSISTED_MEDIA_BYTES = 1_600_000;

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read media file."));
    reader.readAsDataURL(file);
  });

export const GuardianStepStore = {
  loadSteps(): GuardianStep[] {
    if (typeof window === "undefined") {
      return [];
    }

    const raw = localStorage.getItem(STEP_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as GuardianStep[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    } catch {
      return [];
    }
  },

  saveSteps(steps: GuardianStep[]): void {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(STEP_KEY, JSON.stringify(steps));
  },

  addStep(step: GuardianStep): GuardianStep[] {
    const current = this.loadSteps();
    const next = [...current, step];
    this.saveSteps(next);
    return next;
  },

  updateStep(id: string, updates: Partial<GuardianStep>): GuardianStep[] {
    const current = this.loadSteps();
    const next = current.map((step) => (step.id === id ? { ...step, ...updates, id: step.id } : step));
    this.saveSteps(next);
    return next;
  },

  deleteStep(id: string): GuardianStep[] {
    const current = this.loadSteps();
    const next = current.filter((step) => step.id !== id);
    this.saveSteps(next);
    return next;
  },

  clearSteps(): void {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.removeItem(STEP_KEY);
  },

  async buildMediaPayload(file: File | null): Promise<Pick<GuardianStep, "mediaType" | "mediaUrl" | "mediaName">> {
    if (!file) {
      return {
        mediaType: "none",
        mediaUrl: ""
      };
    }

    const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";

    if (mediaType === "none") {
      return {
        mediaType,
        mediaUrl: "",
        mediaName: file.name
      };
    }

    if (file.size > MAX_PERSISTED_MEDIA_BYTES) {
      return {
        mediaType,
        mediaUrl: "",
        mediaName: file.name
      };
    }

    try {
      const mediaUrl = await toDataUrl(file);
      return {
        mediaType,
        mediaUrl,
        mediaName: file.name
      };
    } catch {
      return {
        mediaType,
        mediaUrl: "",
        mediaName: file.name
      };
    }
  }
};
