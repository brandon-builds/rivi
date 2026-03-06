export type Step = {
  stepNumber: number;
  title: string;
  guardianNotes: string;
  timestampStart?: number;
  timestampEnd?: number;
};

export type GuardianProtocol = {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  videoUrl: string;
  steps: Step[];
};

export type GuardianStepMediaType = "video" | "image" | "none";

export type GuardianStep = {
  id: string;
  title: string;
  notes: string;
  mediaType: GuardianStepMediaType;
  mediaUrl: string;
  mediaName?: string;
};
