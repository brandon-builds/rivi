"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildRiviRealtimeInstructions } from "@/lib/services/riviGuidanceContext";
import { GuardianStep } from "@/lib/types";

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";

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

const REALTIME_MODEL = "gpt-4o-realtime-preview";

type UseRiviRealtimeAssistantArgs = {
  steps: GuardianStep[];
  currentStepId?: string;
  requireVideo?: boolean;
  onTranscript?: (transcript: string) => void;
  onReplyDelta?: (deltaText: string) => void;
  onReplyDone?: (finalText: string) => void;
};

export const useRiviRealtimeAssistant = ({
  steps,
  currentStepId,
  requireVideo = false,
  onTranscript,
  onReplyDelta,
  onReplyDone
}: UseRiviRealtimeAssistantArgs) => {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [sessionActive, setSessionActive] = useState(false);
  const [realtimeSupported, setRealtimeSupported] = useState(true);
  const [error, setError] = useState("");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const assistantTranscriptBufferRef = useRef("");
  const sessionActiveRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>("idle");

  useEffect(() => {
    const supported = typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";
    setRealtimeSupported(supported);
  }, []);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

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

  const stopAll = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerRef.current?.close();
    peerRef.current = null;

    audioTrackRef.current?.stop();
    audioTrackRef.current = null;

    setMediaStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    setSessionActive(false);
    setVoiceState("idle");
  }, []);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    channel.send(JSON.stringify(event));
  }, []);

  const updateContext = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    const instructions = buildRiviRealtimeInstructions(steps, currentStepId);
    channel.send(JSON.stringify({
      type: "session.update",
      session: {
        instructions
      }
    }));
  }, [currentStepId, steps]);

  useEffect(() => {
    if (!sessionActive) {
      return;
    }

    updateContext();
  }, [sessionActive, updateContext]);

  const ensureMedia = useCallback(async (): Promise<MediaStream> => {
    if (mediaStream) {
      return mediaStream;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: requireVideo });
    setMediaStream(stream);
    return stream;
  }, [mediaStream, requireVideo]);

  const connectSession = useCallback(async () => {
    if (!realtimeSupported) {
      setError("Realtime voice is not supported in this browser.");
      setVoiceState("error");
      return;
    }

    setError("");
    setVoiceState("connecting");

    try {
      const stream = await ensureMedia();

      const sessionResponse = await fetch("/api/realtime/session", { method: "POST" });
      if (!sessionResponse.ok) {
        throw new Error("Failed to create realtime session.");
      }

      const sessionData = (await sessionResponse.json()) as RealtimeSessionResponse;
      const ephemeralKey = sessionData.client_secret?.value;
      if (!ephemeralKey) {
        throw new Error("Missing client secret.");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addTransceiver("audio", { direction: "recvonly" });

      peer.ontrack = (event) => {
        const streamOut = event.streams[0] ?? new MediaStream([event.track]);
        const audioEl = remoteAudioRef.current;
        if (!audioEl) {
          return;
        }

        audioEl.srcObject = streamOut;
        void audioEl.play().catch(() => undefined);
      };

      const channel = peer.createDataChannel("oai-events");
      dataChannelRef.current = channel;

      channel.onopen = () => {
        setSessionActive(true);
        setVoiceState("listening");
        updateContext();
      };

      channel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeEvent;

          if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript) {
            if (voiceStateRef.current === "speaking") {
              sendRealtimeEvent({ type: "response.cancel" });
              if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
              }
              setVoiceState("listening");
            }

            assistantTranscriptBufferRef.current = "";
            onTranscript?.(payload.transcript);
            return;
          }

          if ((payload.type === "response.audio_transcript.delta" || payload.type === "response.text.delta") && payload.delta) {
            assistantTranscriptBufferRef.current += payload.delta;
            onReplyDelta?.(assistantTranscriptBufferRef.current);
            return;
          }

          if ((payload.type === "response.audio_transcript.done" || payload.type === "response.text.done") && payload.transcript) {
            onReplyDone?.(payload.transcript);
            return;
          }

          if (payload.type === "error") {
            setError("Voice guidance hit a connection issue. Please try again.");
            setVoiceState("error");
          }
        } catch {
          // Ignore malformed event payloads
        }
      };

      const micTrack = stream.getAudioTracks()[0];
      if (!micTrack) {
        throw new Error("Missing microphone track.");
      }

      const localTrack = micTrack.clone();
      localTrack.enabled = true;
      audioTrackRef.current = localTrack;
      peer.addTrack(localTrack, new MediaStream([localTrack]));

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
    } catch {
      setError("Unable to start AI voice guidance right now.");
      setVoiceState("error");
      stopAll();
    }
  }, [ensureMedia, onReplyDelta, onReplyDone, onTranscript, realtimeSupported, sendRealtimeEvent, stopAll, updateContext]);

  const tapWidget = useCallback(async () => {
    if (voiceState === "connecting") {
      return;
    }

    if (!sessionActive) {
      const audioEl = remoteAudioRef.current;
      if (audioEl) {
        void audioEl.play().catch(() => undefined);
      }
      await connectSession();
      return;
    }

    if (voiceState === "speaking") {
      sendRealtimeEvent({ type: "response.cancel" });
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
      }
      setVoiceState("listening");
      return;
    }

    if (!audioTrackRef.current) {
      return;
    }

    const next = !audioTrackRef.current.enabled;
    audioTrackRef.current.enabled = next;
    setVoiceState(next ? "listening" : "idle");
  }, [connectSession, sendRealtimeEvent, sessionActive, voiceState]);

  return {
    voiceState,
    sessionActive,
    realtimeSupported,
    error,
    mediaStream,
    remoteAudioRef,
    tapWidget,
    connectSession,
    stopAll,
    updateContext,
    sendRealtimeEvent,
    setError,
    setVoiceState
  };
};
