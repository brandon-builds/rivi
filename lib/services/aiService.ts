import { GuardianProtocol } from "@/lib/types";

type ClarifyInput = {
  question: string;
  currentStepNumber?: number;
  protocol: GuardianProtocol;
};

export const AIService = {
  async askClarification(input: ClarifyInput): Promise<string> {
    const { question, currentStepNumber, protocol } = input;
    const step = protocol.steps.find((item) => item.stepNumber === currentStepNumber);

    // TODO: Replace this with real Google AI Studio call.
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!step) {
      return `Protocol: ${protocol.name} v${protocol.version}. I can help, but I do not know your current step yet. Question: "${question}". Please confirm the step number and continue carefully.`;
    }

    return `Protocol context says Step ${step.stepNumber}: ${step.title}. Guardian note: ${step.guardianNotes}. Based on your question "${question}", pause and repeat this step once before moving on. If still unsure, contact the guardian.`;
  }
};
