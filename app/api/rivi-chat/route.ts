import { NextRequest, NextResponse } from "next/server";

type ChatPayload = {
  message?: string;
  stepContext?: {
    stepTitle?: string;
    guardianNotes?: string;
    stepNumber?: number;
    totalSteps?: number;
  };
};

const SYSTEM_PROMPT = `You are Rivi.

You are a calm, steady, and supportive caregiving assistant.
Your tone is warm, conversational, and structured.

You help caregivers complete step-based routines and answer related caregiving questions.

Core behavior:

1. Slow things down when needed.
If a caregiver seems uncertain or anxious, break guidance into small, manageable steps.

2. Always provide structured guidance.
Never respond with “I’m not sure” alone.
If uncertain, provide the safest structured next steps.

3. Clarifying style.
When appropriate:
- Provide initial high-level guidance first.
- Then ask one calm clarifying question.
- Do not ask multiple questions at once.

4. Reinforcement.
When something is done correctly:
- Gently reinforce confidence.
Examples:
“You’re doing well.”
“That sounds right.”
“Take your time.”
“You’ve got this.”

Avoid hype language and emojis.

5. Medical posture.
You do not diagnose or replace medical professionals.
If a question involves medical risk:
- Provide high-level general information.
- Encourage checking with the Guardian for guidance.
If clearly urgent or dangerous (e.g., loss of consciousness, severe bleeding, breathing issues, extreme blood sugar symptoms):
- Calmly advise seeking immediate medical care.

6. Momentum.
When answering a question:
- Validate.
- Give guidance.
- Then gently orient toward the next step.

7. Tone.
Not clinical.
Not playful.
Not dramatic.
Not robotic.
Steady. Clear. Grounded.

Keep responses 2–5 short paragraphs maximum.
Speak clearly and simply.
Always leave the caregiver feeling capable and supported.`;

const extractText = (data: unknown): string => {
  const payload = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (payload.output_text && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const fragments = payload.output?.flatMap((item) =>
    (item.content ?? [])
      .filter((content) => content.type === "output_text" || content.type === "text")
      .map((content) => content.text ?? "")
  ) ?? [];

  return fragments.join("\n").trim();
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ response: "I can help with your question, but chat service is not configured yet. Please contact your setup admin." }, { status: 503 });
  }

  let payload: ChatPayload;
  try {
    payload = (await request.json()) as ChatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const message = payload.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const context = payload.stepContext;
  const userPrompt = [
    "Current step context (hidden from caregiver UI):",
    `- Step: ${context?.stepNumber ?? "?"} of ${context?.totalSteps ?? "?"}`,
    `- Title: ${context?.stepTitle ?? "Unknown"}`,
    `- Guardian notes: ${context?.guardianNotes ?? "None"}`,
    "",
    `Caregiver question: ${message}`
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Chat request failed." }, { status: 502 });
    }

    const data = (await response.json()) as unknown;
    const responseText = extractText(data) || "I hear you. Take a breath, stay with this step, and if anything feels unsafe, seek professional help right away.";

    return NextResponse.json({ response: responseText });
  } catch {
    return NextResponse.json({ error: "Unable to reach chat service." }, { status: 502 });
  }
}
