"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { CaregiverSessionStore } from "@/lib/stores/caregiverSessionStore";
import { buildRiviRealtimeInstructions } from "@/lib/services/riviGuidanceContext";
import { GuardianStep } from "@/lib/types";

type VoiceState = "idle" | "connecting" | "listening" | "speaking";

type RealtimeSessionResponse = {
  client_secret?: {
    value?: string;
  };
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
};

const TRANSITION_MS = 200;
const REALTIME_MODEL = "gpt-4o-realtime-preview";

export default function HandsFreePage() {
  const [steps, setSteps] = useState<GuardianStep[]>([]);
  const [index, setIndex] = useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [guidanceOn, setGuidanceOn] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [guidanceStream, setGuidanceStream] = useState<MediaStream | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [realtimeSupported, setRealtimeSupported] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);

  const [latestTranscript, setLatestTranscript] = useState("");
  const [guidanceReply, setGuidanceReply] = useState("");
  const [replyVersion, setReplyVersion] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const guidanceOnRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>("idle");
  const assistantTranscriptBufferRef = useRef("");
  const stepIntroPendingRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    guidanceOnRef.current = guidanceOn;
  }, [guidanceOn]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const currentStep = useMemo(() => steps[index], [steps, index]);
  const isLastStep = index >= steps.length - 1;

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    channel.send(JSON.stringify(event));
  }, []);

  const stopRealtimeSession = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerRef.current?.close();
    peerRef.current = null;

    audioTrackRef.current?.stop();
    audioTrackRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    setSessionActive(false);
    setVoiceState("idle");
  }, []);

  useEffect(() => {
    const savedSteps = GuardianStepStore.loadSteps();
    setSteps(savedSteps);
    setIndex(0);
    CaregiverSessionStore.begin(savedSteps.map((step) => step.id));

    const supported = typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";
    setRealtimeSupported(supported);
  }, []);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) {
      return;
    }

    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = false;
    audio.volume = 1;

    const handlePlay = () => setVoiceState("speaking");
    const handlePause = () => {
      setVoiceState((current) => (sessionActiveRef.current ? (audioTrackRef.current?.enabled ? "listening" : "idle") : current));
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.pause();
      audio.srcObject = null;
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = guidanceStream;

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [guidanceStream]);

  const sendStepContext = useCallback((allSteps: GuardianStep[], currentStepId?: string) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    const instructions = buildRiviRealtimeInstructions(allSteps, currentStepId);

    channel.send(JSON.stringify({
      type: "session.update",
      session: {
        instructions
      }
    }));
  }, []);

  const promptStepGuidance = useCallback((mode: "intro" | "advance") => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open" || !currentStep) {
      return;
    }

    const prefix = mode === "advance" ? "Start with: Great. Let's move to the next step." : "Start with a calm transition phrase.";

    sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: `${prefix} Then briefly guide the caregiver for step ${index + 1} of ${steps.length}: \"${currentStep.title}\" using guardian notes first. Keep it to 1-2 short sentences.`
      }
    });
  }, [currentStep, index, sendRealtimeEvent, steps.length]);

  useEffect(() => {
    if (!sessionActive || !currentStep) {
      return;
    }

    sendStepContext(steps, currentStep.id);

    // When the step changes during an active session, proactively guide the caregiver.
    if (stepIntroPendingRef.current) {
      promptStepGuidance("advance");
      stepIntroPendingRef.current = false;
    }
  }, [currentStep, promptStepGuidance, sendStepContext, sessionActive, steps]);

  useEffect(() => {
    return () => {
      stopRealtimeSession();

      setGuidanceStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, [stopRealtimeSession]);

  const advanceAfterTransition = () => {
    if (!currentStep) {
      return;
    }

    CaregiverSessionStore.markCompleted(currentStep.id);
    setIsTransitioning(true);

    window.setTimeout(() => {
      if (isLastStep) {
        CaregiverSessionStore.finish(new Date().toISOString());
        router.push("/caregiver/summary");
        return;
      }

      setIndex((current) => Math.min(current + 1, steps.length - 1));
      requestAnimationFrame(() => {
        setIsTransitioning(false);
        setIsAdvancing(false);
      });
    }, TRANSITION_MS);
  };

  const handleConfirmComplete = () => {
    if (isAdvancing || isTransitioning) {
      return;
    }

    setShowCompleteConfirm(false);
    setIsAdvancing(true);
    stepIntroPendingRef.current = true;
    advanceAfterTransition();
  };

  const connectRealtimeSession = async () => {
    if (!guidanceStream || !currentStep || !realtimeSupported) {
      if (!realtimeSupported) {
        setPermissionError("Realtime voice is not supported in this browser.");
      }
      return;
    }

    setPermissionError("");
    setVoiceState("connecting");

    try {
      const sessionResponse = await fetch("/api/realtime/session", { method: "POST" });
      if (!sessionResponse.ok) {
        throw new Error("Failed to create realtime session.");
      }

      const sessionData = (await sessionResponse.json()) as RealtimeSessionResponse;
      const ephemeralKey = sessionData.client_secret?.value;

      if (!ephemeralKey) {
        throw new Error("Missing client secret.");
      }

      console.debug("[Rivi Realtime] Session token acquired");

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addTransceiver("audio", { direction: "recvonly" });

      peer.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        const audioEl = remoteAudioRef.current;

        console.debug("[Rivi Realtime] Remote track received", {
          kind: event.track?.kind,
          id: event.track?.id,
          streamId: stream.id
        });

        if (!audioEl) {
          return;
        }

        audioEl.srcObject = stream;
        console.debug("[Rivi Realtime] Audio srcObject assigned");
        void audioEl.play()
          .then(() => {
            console.debug("[Rivi Realtime] audio.play() success");
          })
          .catch((error) => {
            console.error("[Rivi Realtime] audio.play() failed", error);
          });
      };

      const channel = peer.createDataChannel("oai-events");
      dataChannelRef.current = channel;

      channel.onopen = () => {
        console.debug("[Rivi Realtime] Data channel connected");
        setSessionActive(true);
        setVoiceState("listening");
        sendStepContext(steps, currentStep.id);
        promptStepGuidance("intro");
      };

      channel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeEvent;

          if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript) {
            if (voiceStateRef.current === "speaking" || !remoteAudioRef.current?.paused) {
              sendRealtimeEvent({ type: "response.cancel" });
              if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
              }
              setVoiceState("listening");
            }

            const normalized = payload.transcript.trim().toLowerCase();
            const compact = normalized.replace(/[.!?]/g, "").trim();
            const isConfirmation = /\b(done|okay|ok|got it|finished)\b/.test(compact);

            if (isConfirmation) {
              setLatestTranscript(payload.transcript);
              setGuidanceReply("Great. Let's move to the next step.");
              setReplyVersion((current) => current + 1);

              if (!isAdvancing && !isTransitioning) {
                setIsAdvancing(true);
                stepIntroPendingRef.current = true;
                advanceAfterTransition();
              }
              return;
            }

            setLatestTranscript(payload.transcript);
            setGuidanceReply("Thinking...");
            setReplyVersion((current) => current + 1);
            assistantTranscriptBufferRef.current = "";
            return;
          }

          if ((payload.type === "response.audio_transcript.delta" || payload.type === "response.text.delta") && payload.delta) {
            assistantTranscriptBufferRef.current += payload.delta;
            setGuidanceReply(assistantTranscriptBufferRef.current);
            return;
          }

          if ((payload.type === "response.audio_transcript.done" || payload.type === "response.text.done") && payload.transcript) {
            setGuidanceReply(payload.transcript);
            setReplyVersion((current) => current + 1);
            return;
          }

          if (payload.type === "error") {
            setPermissionError("Voice guidance hit a connection issue. Please try again.");
          }
        } catch {
          // Ignore malformed realtime events.
        }
      };

      const audioTrack = guidanceStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("Missing microphone track.");
      }

      const localTrack = audioTrack.clone();
      localTrack.enabled = true;
      audioTrackRef.current = localTrack;
      peer.addTrack(localTrack, new MediaStream([localTrack]));
      console.debug("[Rivi Realtime] Local mic track attached", {
        id: localTrack.id,
        kind: localTrack.kind,
        enabled: localTrack.enabled
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });

      if (!sdpResponse.ok) {
        throw new Error("Failed realtime SDP exchange.");
      }

      const answerSdp = await sdpResponse.text();
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });
      console.debug("[Rivi Realtime] Session connected");
    } catch {
      stopRealtimeSession();
      setPermissionError("Unable to start AI voice guidance right now.");
    }
  };

  const toggleListening = () => {
    if (!sessionActive || !audioTrackRef.current) {
      return;
    }

    const nextEnabled = !audioTrackRef.current.enabled;
    audioTrackRef.current.enabled = nextEnabled;
    setVoiceState(nextEnabled ? "listening" : "idle");
  };

  const handleAskRiviTap = async () => {
    if (!guidanceOn || voiceState === "connecting") {
      return;
    }

    if (!sessionActive) {
      const audioEl = remoteAudioRef.current;
      if (audioEl) {
        void audioEl.play()
          .then(() => {
            console.debug("[Rivi Realtime] audio.play() preflight success");
          })
          .catch((error) => {
            console.error("[Rivi Realtime] audio.play() preflight failed", error);
          });
      }

      await connectRealtimeSession();
      return;
    }

    toggleListening();
  };

  const enableGuidance = async () => {
    setPermissionError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setGuidanceStream(stream);
      setGuidanceOn(true);
      setVoiceState("idle");
    } catch {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      setGuidanceOn(false);
    }
  };

  const handleGuidanceToggle = async () => {
    if (guidanceOn) {
      stopRealtimeSession();

      setGuidanceStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });

      setGuidanceOn(false);
      setVoiceState("idle");
      return;
    }

    await enableGuidance();
  };

  if (!currentStep) {
    return (
      <main className="app-shell flex items-center">
        <section className="rivi-card w-full space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">No Steps Available</p>
          <h1 className="text-2xl font-bold">Run Guardian Setup first.</h1>
          <button type="button" className="btn-primary w-full active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/guardian/setup")}>
            Open Guardian Setup
          </button>
        </section>
      </main>
    );
  }

  const animatedClass = `step-swap ${isTransitioning ? "step-swap-out" : ""}`;
  const showGuidanceCard = Boolean(latestTranscript || guidanceReply);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />
      <main className="app-shell pb-40">
        <header className="mb-5 flex items-center justify-between">
          <button type="button" className="btn-secondary px-4 active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/")}>
            Back
          </button>
          <p className="text-base font-bold text-primary">Rivi</p>
        </header>

        <section className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Step {index + 1} of {steps.length}
          </p>

          <h1 className={`text-3xl font-bold tracking-tight text-slate-900 ${animatedClass}`}>{currentStep.title}</h1>

          <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${animatedClass}`}>
            <p className="text-base leading-relaxed text-slate-700">{currentStep.notes}</p>
          </div>

          <div className={animatedClass}>
            {currentStep.mediaType === "video" && currentStep.mediaUrl ? (
              <video className="w-full rounded-3xl bg-black shadow-sm" src={currentStep.mediaUrl} controls playsInline />
            ) : null}

            {currentStep.mediaType === "image" && currentStep.mediaUrl ? (
              <img className="w-full rounded-3xl bg-white object-cover shadow-sm" src={currentStep.mediaUrl} alt={currentStep.title} />
            ) : null}

            {(currentStep.mediaType === "image" || currentStep.mediaType === "video") && !currentStep.mediaUrl ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                Media for this step is not currently available in local storage.
              </div>
            ) : null}
          </div>

          {showGuidanceCard ? (
            <section className="rivi-card guidance-reply-card" key={replyVersion}>
              <p className="text-sm font-semibold text-primary">Rivi Guidance</p>
              {latestTranscript ? <p className="mt-1 text-xs text-slate-500">You said: {latestTranscript}</p> : null}
              {guidanceReply ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">{guidanceReply}</p> : null}
            </section>
          ) : null}
        </section>
      </main>

      {guidanceOn ? (
        <>
          <aside className="guidance-panel">
            <div className="guidance-preview-wrap">
              <video ref={videoRef} className="guidance-preview" autoPlay playsInline muted />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`guidance-mic-dot ${voiceState === "listening" ? "guidance-mic-dot-live" : ""}`} />
              <p className="text-xs font-medium text-slate-700">{voiceState === "connecting" ? "Connecting..." : voiceState === "listening" ? "Listening..." : voiceState === "speaking" ? "Speaking..." : "Ready"}</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Guidance is on. Tap Ask Rivi whenever you need help.</p>
            {!realtimeSupported ? <p className="mt-1 text-[11px] text-slate-500">Realtime voice is not supported in this browser.</p> : null}
          </aside>

          <div className="guidance-fab-wrap">
            <button
              type="button"
              className={`guidance-fab ${voiceState === "listening" ? "guidance-fab-listening" : ""}`}
              onClick={() => {
                void handleAskRiviTap();
              }}
              disabled={voiceState === "connecting" || !realtimeSupported}
              aria-label="Ask Rivi"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" fill="currentColor" />
                <path d="M18 11.5a6 6 0 0 1-12 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M12 17.5V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
            <p className="guidance-fab-label">Ask Rivi</p>
          </div>
        </>
      ) : null}

      <div className="sticky-cta-bar">
        <div className="mx-auto w-full max-w-md space-y-2">
          <button
            type="button"
            className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowCompleteConfirm(true)}
            disabled={isAdvancing || isTransitioning}
          >
            Next Step
          </button>
          <button
            type="button"
            className={`w-full rounded-2xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] ${guidanceOn ? "bg-slate-700 hover:bg-slate-800" : "bg-primary hover:bg-primaryDark"}`}
            onClick={() => {
              void handleGuidanceToggle();
            }}
            disabled={isAdvancing || isTransitioning}
          >
            {guidanceOn ? "Turn Off AI Rivi Guidance" : "Enable AI Rivi Guidance"}
          </button>
          {permissionError ? <p className="text-sm text-alert">{permissionError}</p> : null}
        </div>
      </div>

      {showCompleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-slate-900">Mark this step complete?</h2>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmComplete}
                disabled={isAdvancing || isTransitioning}
              >
                Mark Complete
              </button>
              <button
                type="button"
                className="btn-secondary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setShowCompleteConfirm(false)}
                disabled={isAdvancing || isTransitioning}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
