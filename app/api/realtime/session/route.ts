import { NextResponse } from "next/server";
import { PUMP_CHANGE_KNOWLEDGE_BLOCK } from "@/lib/services/riviGuidanceContext";

const MODEL = "gpt-4o-realtime-preview";
const VOICE = "alloy";
const INSTRUCTIONS = `You are Rivi, a calm and supportive caregiver assistant that helps people follow guardian instructions step-by-step.
Prioritize guardian-uploaded protocol first, then use general pump-change knowledge only to supplement.
If anything is unclear or safety-sensitive, recommend checking with the guardian.

${PUMP_CHANGE_KNOWLEDGE_BLOCK}`;

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
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

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json({ error: "Failed to create realtime session.", details: errorBody }, { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to reach OpenAI realtime sessions API." }, { status: 502 });
  }
}
