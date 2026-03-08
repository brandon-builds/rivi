import { NextResponse } from "next/server";
import { PUMP_CHANGE_KNOWLEDGE_BLOCK } from "@/lib/services/riviGuidanceContext";

const MODEL = "gpt-4o-realtime-preview";
const VOICE = "alloy";

const INSTRUCTIONS = `
You are Rivi, a calm and supportive caregiver assistant that helps people follow guardian instructions step-by-step.

Rules:
- Guardian protocol instructions are always the highest priority.
- Use general pump-change knowledge only to supplement guardian instructions.
- If anything is unclear or safety-sensitive, recommend checking with the guardian.
- Speak in a calm, supportive tone.

${PUMP_CHANGE_KNOWLEDGE_BLOCK}
`;

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY missing");
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        instructions: INSTRUCTIONS,
        modalities: ["audio", "text"]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Realtime session error:", data);
      return NextResponse.json(data, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Realtime session exception:", err);
    return NextResponse.json(
      { error: "Failed to create realtime session." },
      { status: 500 }
    );
  }
}