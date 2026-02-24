import { GuardianProtocol, Step } from "@/lib/types";

const PROTOCOL_KEY = "guardian_protocol_v1";

export const ProtocolStore = {
  saveProtocol(protocol: GuardianProtocol): void {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(PROTOCOL_KEY, JSON.stringify(protocol));
  },

  loadProtocol(): GuardianProtocol | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = localStorage.getItem(PROTOCOL_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as GuardianProtocol;
      return parsed;
    } catch {
      return null;
    }
  },

  saveSteps(steps: Step[]): GuardianProtocol | null {
    const protocol = this.loadProtocol();
    if (!protocol) {
      return null;
    }

    const updated: GuardianProtocol = {
      ...protocol,
      steps: [...steps].sort((a, b) => a.stepNumber - b.stepNumber)
    };

    this.saveProtocol(updated);
    return updated;
  }
};
