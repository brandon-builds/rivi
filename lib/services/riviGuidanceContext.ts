import { GuardianStep } from "@/lib/types";

const BASE_RIVI_STYLE = `You are Rivi, a calm and supportive caregiver assistant.
Speak in short, steady, practical sentences.
Provide step-based guidance and keep the caregiver grounded.`;

const PRIORITY_RULES = `Behavior priority:
1) Follow guardian-uploaded instructions first.
2) Use general pump-change knowledge only to supplement or clarify.
3) If something is unclear, missing, or safety-sensitive, advise checking with the guardian.`;

const SAFETY_POSTURE = `Safety posture:
- Do not diagnose.
- For medical risk or uncertainty, provide high-level safety guidance and recommend contacting the guardian.
- For urgent danger signs (e.g., breathing issues, loss of consciousness, severe bleeding, extreme glucose symptoms), advise immediate medical care.`;

export const PUMP_CHANGE_KNOWLEDGE_BLOCK = `Common pediatric pump-change knowledge (secondary reference only):
- Prepare clean supplies before starting and minimize interruptions.
- Confirm the right device/site/supplies before placement.
- Maintain skin/site hygiene and secure adhesion.
- Follow ordered priming/fill/connection sequence carefully.
- Check for obvious leaks, occlusion indicators, or poor adhesion after placement.
- Monitor for discomfort, unusual symptoms, or glucose trend concerns after the change.
- If readings or symptoms are concerning, pause and escalate to guardian/clinical guidance.`;

const buildProtocolSection = (steps: GuardianStep[], currentStepId: string | undefined): string => {
  if (steps.length === 0) {
    return "Guardian protocol: no steps found.";
  }

  const currentIndex = currentStepId ? steps.findIndex((step) => step.id === currentStepId) : -1;
  const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
  const current = steps[resolvedIndex];

  const formattedSteps = steps
    .map((step, idx) => {
      const notes = step.notes?.trim() ? `Notes: ${step.notes.trim()}` : "Notes: (none)";
      return `Step ${idx + 1}: ${step.title}\n${notes}`;
    })
    .join("\n\n");

  return [
    "Guardian protocol context (primary source):",
    `Current step: ${resolvedIndex + 1} of ${steps.length}`,
    `Current title: ${current?.title ?? "Unknown"}`,
    `Current guardian notes: ${current?.notes ?? "(none)"}`,
    "",
    "Full guardian step list:",
    formattedSteps
  ].join("\n");
};

export const buildRiviRealtimeInstructions = (steps: GuardianStep[], currentStepId?: string): string => {
  return [
    BASE_RIVI_STYLE,
    PRIORITY_RULES,
    SAFETY_POSTURE,
    "",
    buildProtocolSection(steps, currentStepId),
    "",
    PUMP_CHANGE_KNOWLEDGE_BLOCK
  ].join("\n\n");
};
