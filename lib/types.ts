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
