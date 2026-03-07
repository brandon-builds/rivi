import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Transcription service is not configured." }, { status: 503 });
  }

  let audioFile: File | null = null;

  try {
    const formData = await request.formData();
    const candidate = formData.get("audio");

    if (candidate instanceof File) {
      audioFile = candidate;
    }
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  try {
    const upstreamForm = new FormData();
    upstreamForm.append("model", "whisper-1");
    upstreamForm.append("file", audioFile, audioFile.name || "audio.webm");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: upstreamForm
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Transcription request failed." }, { status: 502 });
    }

    const data = (await response.json()) as { text?: string };
    const transcript = data.text?.trim() ?? "";

    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json({ error: "Unable to reach transcription service." }, { status: 502 });
  }
}
