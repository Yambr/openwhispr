const WebSocket = require("ws");
const debugLogger = require("./debugLogger");
const { OPENWHISPR_REALTIME_WSS_URL } = require("../config/build-config.generated.cjs");

const WEBSOCKET_TIMEOUT_MS = 15000;
const DISCONNECT_TIMEOUT_MS = 3000;
const SAMPLE_RATE = 24000;
const COLD_START_BUFFER_MAX = 3 * SAMPLE_RATE * 2; // 3 seconds of 16-bit PCM
// C3 (260610-muw, owner-authorized upstream edit): app-level keepalive so a
// half-dead socket is detected and proactively torn down instead of rotting
// until the gateway's `1011 keepalive ping timeout` (lost 20-40 min of
// transcript per death). KEEPALIVE_INTERVAL_MS between ws.ping()s;
// MISSED_PONG_LIMIT intervals without a "pong" → terminate.
const KEEPALIVE_INTERVAL_MS = 15000;
const MISSED_PONG_LIMIT = 2;

class OpenAIRealtimeStreaming {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.completedSegments = [];
    this.currentPartial = "";
    this.onPartialTranscript = null;
    this.onFinalTranscript = null;
    this.onError = null;
    this.onSessionEnd = null;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.connectionTimeout = null;
    this.isDisconnecting = false;
    this.audioBytesSent = 0;
    this.model = "gpt-4o-mini-transcribe";
    this.coldStartBuffer = [];
    this.coldStartBufferSize = 0;
    this.speechStartedAt = null;
    // C3 keepalive bookkeeping.
    this.keepaliveTimer = null;
    this.lastPongAt = 0;
  }

  // C3 (260610-muw): start the keepalive ping + pong-liveness watchdog. Called
  // once the session is ready (session.created preconfigured / session.updated).
  startKeepalive() {
    this.lastPongAt = Date.now();
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      // No pong within MISSED_PONG_LIMIT intervals → socket is half-dead.
      if (Date.now() - this.lastPongAt > KEEPALIVE_INTERVAL_MS * MISSED_PONG_LIMIT) {
        debugLogger.debug("OpenAI Realtime keepalive: no pong, terminating", {
          model: this.model,
          sinceLastPongMs: Date.now() - this.lastPongAt,
        });
        // terminate() kills a half-dead socket immediately; fall back to
        // close() if absent. Either fires the existing close handler →
        // onSessionEnd → meeting-path reconnect.
        if (typeof this.ws.terminate === "function") this.ws.terminate();
        else this.ws.close();
        return;
      }
      try {
        this.ws.ping();
      } catch (err) {
        debugLogger.debug("OpenAI Realtime keepalive ping failed", { error: err?.message });
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  getFullTranscript() {
    return this.completedSegments.join(" ");
  }

  async connect(options = {}) {
    const { apiKey, model, preconfigured, language, wssUrl } = options;
    if (!apiKey) throw new Error("OpenAI API key is required");

    if (this.isConnected || this.isConnecting) {
      debugLogger.debug("OpenAI Realtime already connected/connecting");
      return;
    }

    this.isConnecting = true;
    this.model = model || "gpt-4o-mini-transcribe";
    this.preconfigured = !!preconfigured;
    this.completedSegments = [];
    this.currentPartial = "";
    this.audioBytesSent = 0;
    this.coldStartBuffer = [];
    this.coldStartBufferSize = 0;
    this.speechStartedAt = null;

    // Phase 05 D-04 / RC-2 (v1.7.19): route realtime through the corporate
    // backend (Speaches+LiteLLM is OpenAI-Realtime-compatible). The host is a
    // dumb-transport INPUT: the caller (ipcHandlers) derives it at runtime from
    // backendUrlState.getBackendUrl() and passes it via options.wssUrl. When
    // absent (default build / no runtime override) fall back to the build-time
    // OPENWHISPR_REALTIME_WSS_URL constant. Empty resolved host = offline build
    // → fail fast (do NOT fall back to api.openai.com).
    const resolvedWssUrl = wssUrl || OPENWHISPR_REALTIME_WSS_URL;
    if (!resolvedWssUrl) {
      this.isConnecting = false;
      throw new Error(
        "Realtime streaming is not configured for this build (OPENWHISPR_REALTIME_WSS_URL is empty). " +
          "Set OPENWHISPR_BACKEND_URL or OPENWHISPR_REALTIME_WSS_URL at build time, " +
          "or disable streaming with OPENWHISPR_STREAMING=false."
      );
    }
    const sep = resolvedWssUrl.includes("?") ? "&" : "?";
    const langSuffix = language ? `&language=${encodeURIComponent(language)}` : "";
    const url = `${resolvedWssUrl}${sep}intent=transcription${langSuffix}`;
    debugLogger.debug("OpenAI Realtime connecting", {
      model: this.model,
      language: language || undefined,
    });

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.connectionTimeout = setTimeout(() => {
        this.isConnecting = false;
        this.cleanup();
        reject(new Error("OpenAI Realtime connection timeout"));
      }, WEBSOCKET_TIMEOUT_MS);

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      this.ws.on("open", () => {
        debugLogger.debug("OpenAI Realtime WebSocket opened");
      });

      // C3 (260610-muw): record pong liveness for the keepalive watchdog.
      this.ws.on("pong", () => {
        this.lastPongAt = Date.now();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        debugLogger.error("OpenAI Realtime WebSocket error", { error: error.message });
        this.isConnecting = false;
        this.cleanup();
        if (this.pendingReject) {
          this.pendingReject(error);
          this.pendingReject = null;
          this.pendingResolve = null;
        }
        this.onError?.(error);
      });

      this.ws.on("close", (code, reason) => {
        const wasActive = this.isConnected;
        this.isConnecting = false;
        this.stopKeepalive(); // C3: stop pinging a closed socket.
        debugLogger.debug("OpenAI Realtime WebSocket closed", {
          code,
          reason: reason?.toString(),
          wasActive,
        });
        if (this.pendingReject) {
          this.pendingReject(new Error(`WebSocket closed before ready (code: ${code})`));
          this.pendingReject = null;
          this.pendingResolve = null;
        }
        this.cleanup();
        if (wasActive && !this.isDisconnecting) {
          this.onSessionEnd?.({ text: this.getFullTranscript() });
        }
      });
    });
  }

  handleMessage(data) {
    try {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case "session.created": {
          if (this.preconfigured) {
            // Server-side ephemeral token already configured the session;
            // sending an update would strip language and noise-reduction.
            debugLogger.debug("OpenAI Realtime session created (preconfigured)", {
              model: this.model,
            });
            this.isConnected = true;
            this.isConnecting = false;
            clearTimeout(this.connectionTimeout);
            this.startKeepalive(); // C3: session ready → begin keepalive.
            if (this.pendingResolve) {
              this.pendingResolve();
              this.pendingResolve = null;
              this.pendingReject = null;
            }
          } else {
            debugLogger.debug("OpenAI Realtime session created, sending configuration", {
              model: this.model,
            });
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) break;
            this.ws.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  type: "transcription",
                  audio: {
                    input: {
                      format: { type: "audio/pcm", rate: SAMPLE_RATE },
                      transcription: { model: this.model },
                      turn_detection: {
                        type: "server_vad",
                        threshold: 0.6,
                        silence_duration_ms: 600,
                        prefix_padding_ms: 500,
                      },
                    },
                  },
                },
              })
            );
          }
          break;
        }

        case "session.updated": {
          if (this.pendingResolve) {
            this.isConnected = true;
            this.isConnecting = false;
            clearTimeout(this.connectionTimeout);
            this.startKeepalive(); // C3: session ready → begin keepalive.
            debugLogger.debug("OpenAI Realtime session configured", {
              model: this.model,
            });
            this.pendingResolve();
            this.pendingResolve = null;
            this.pendingReject = null;
          }
          break;
        }

        case "conversation.item.input_audio_transcription.delta": {
          const delta = event.delta || "";
          if (delta) {
            this.currentPartial += delta;
            this.onPartialTranscript?.(this.currentPartial);
          }
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const transcript = (event.transcript || "").trim();
          if (transcript) {
            this.completedSegments.push(transcript);
          }
          this.currentPartial = "";
          const speechTimestamp = this.speechStartedAt || Date.now();
          this.speechStartedAt = null;
          if (transcript) {
            const fullText = this.getFullTranscript();
            this.onFinalTranscript?.(fullText, speechTimestamp);
            debugLogger.debug("OpenAI Realtime turn completed", {
              turnText: transcript.slice(0, 100),
              totalLength: fullText.length,
              segments: this.completedSegments.length,
            });
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          this.speechStartedAt = Date.now();
          break;
        case "input_audio_buffer.speech_stopped":
        case "input_audio_buffer.committed":
          break;

        case "error": {
          const errCode = event.error?.code;
          const errMsg = event.error?.message || "OpenAI Realtime error";
          const isEmptyBuffer =
            errCode === "input_audio_buffer_commit_empty" ||
            errMsg.includes("buffer too small") ||
            errMsg.includes("commit_empty");
          if (isEmptyBuffer) {
            debugLogger.debug("OpenAI Realtime empty buffer (server VAD already committed)", {
              code: errCode,
            });
          } else {
            debugLogger.error("OpenAI Realtime error event", {
              code: errCode,
              message: errMsg,
            });
          }
          this.onError?.(new Error(errMsg));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      debugLogger.error("OpenAI Realtime message parse error", { error: err.message });
    }
  }

  sendAudio(pcmBuffer) {
    if (!this.ws) return false;

    if (this.ws.readyState !== WebSocket.OPEN) {
      if (
        this.ws.readyState === WebSocket.CONNECTING &&
        this.coldStartBufferSize < COLD_START_BUFFER_MAX
      ) {
        const copy = Buffer.from(pcmBuffer);
        this.coldStartBuffer.push(copy);
        this.coldStartBufferSize += copy.length;
      }
      return false;
    }

    if (this.coldStartBuffer.length > 0) {
      debugLogger.debug("OpenAI Realtime flushing cold-start buffer", {
        chunks: this.coldStartBuffer.length,
        bytes: this.coldStartBufferSize,
      });
      for (const buf of this.coldStartBuffer) {
        const b64 = buf.toString("base64");
        this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
        this.audioBytesSent += buf.length;
      }
      this.coldStartBuffer = [];
      this.coldStartBufferSize = 0;
    }

    const base64Audio = Buffer.from(pcmBuffer).toString("base64");
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64Audio }));
    this.audioBytesSent += pcmBuffer.length;
    return true;
  }

  async disconnect() {
    debugLogger.debug("OpenAI Realtime disconnect", {
      audioBytesSent: this.audioBytesSent,
      segments: this.completedSegments.length,
      textLength: this.getFullTranscript().length,
      readyState: this.ws?.readyState,
    });

    if (!this.ws) return { text: this.getFullTranscript() };

    this.isDisconnecting = true;

    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.once("open", () => this.ws?.close());
      const result = { text: this.getFullTranscript() };
      this.isDisconnecting = false;
      return result;
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      if (this.audioBytesSent > 0) {
        const prevOnFinal = this.onFinalTranscript;
        const prevOnError = this.onError;

        await new Promise((resolve) => {
          const tid = setTimeout(() => {
            debugLogger.debug("OpenAI Realtime commit timeout, using accumulated text");
            resolve();
          }, DISCONNECT_TIMEOUT_MS);

          const done = () => {
            clearTimeout(tid);
            this.onFinalTranscript = prevOnFinal;
            this.onError = prevOnError;
            resolve();
          };

          this.onFinalTranscript = (text) => {
            prevOnFinal?.(text);
            done();
          };

          this.onError = (err) => {
            if (
              err?.message?.includes("buffer too small") ||
              err?.message?.includes("commit_empty")
            ) {
              done();
            } else {
              prevOnError?.(err);
            }
          };

          try {
            this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          } catch {
            done();
          }
        });
      }

      this.ws.close();
    }

    const result = { text: this.getFullTranscript() };
    this.cleanup();
    this.isDisconnecting = false;
    return result;
  }

  cleanup() {
    this.stopKeepalive(); // C3: ensure the keepalive timer never leaks.
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }
}

module.exports = OpenAIRealtimeStreaming;
