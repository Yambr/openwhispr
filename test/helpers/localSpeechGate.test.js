// Uses globals enabled in vitest.config.ts (test, expect available without import).

test("treats near silence as skippable", async () => {
  const { createLocalSpeechGateState, recordLocalSpeechWindow, getLocalSpeechGateDecision } =
    await import("../../src/helpers/localSpeechGate.js");

  const state = createLocalSpeechGateState();
  recordLocalSpeechWindow(state, 0.0012, 0.01);
  recordLocalSpeechWindow(state, 0.0016, 0.015);
  recordLocalSpeechWindow(state, 0.0014, 0.012);

  expect(getLocalSpeechGateDecision(state)).toEqual({
    skip: true,
    reason: "silence",
    peakRms: 0.0016,
    peakAmplitude: 0.015,
    windowCount: 3,
    speechWindowCount: 0,
    maxConsecutiveSpeechWindows: 0,
  });
});

test("rejects isolated noise bursts without sustained speech", async () => {
  const { createLocalSpeechGateState, recordLocalSpeechWindow, getLocalSpeechGateDecision } =
    await import("../../src/helpers/localSpeechGate.js");

  const state = createLocalSpeechGateState();
  // All windows have energy above silence but below speech thresholds
  recordLocalSpeechWindow(state, 0.0025, 0.015);
  recordLocalSpeechWindow(state, 0.0028, 0.018);
  recordLocalSpeechWindow(state, 0.0022, 0.014);

  const decision = getLocalSpeechGateDecision(state);

  expect(decision.skip).toBe(true);
  expect(decision.reason).toBe("insufficient_speech");
  expect(decision.peakRms).toBe(0.0028);
  expect(decision.peakAmplitude).toBe(0.018);
  expect(decision.windowCount).toBe(3);
  expect(decision.speechWindowCount).toBe(0);
  expect(decision.maxConsecutiveSpeechWindows).toBe(0);
});

test("allows sustained speech-like energy through", async () => {
  const { createLocalSpeechGateState, recordLocalSpeechWindow, getLocalSpeechGateDecision } =
    await import("../../src/helpers/localSpeechGate.js");

  const state = createLocalSpeechGateState();
  recordLocalSpeechWindow(state, 0.003, 0.025);
  recordLocalSpeechWindow(state, 0.0056, 0.06);
  recordLocalSpeechWindow(state, 0.0061, 0.065);

  expect(getLocalSpeechGateDecision(state)).toEqual({
    skip: false,
    reason: "speech_detected",
    peakRms: 0.0061,
    peakAmplitude: 0.065,
    windowCount: 3,
    speechWindowCount: 3,
    maxConsecutiveSpeechWindows: 3,
  });
});
