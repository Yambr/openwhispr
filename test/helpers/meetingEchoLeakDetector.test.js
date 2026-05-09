// Uses globals enabled in vitest.config.ts (test, expect available without import).

const MeetingEchoLeakDetector = require("../../src/helpers/meetingEchoLeakDetector");

test("shouldSuppressMicSegment keeps bleed evidence even when share stays below render-bleed gate", () => {
  const detector = new MeetingEchoLeakDetector();
  const nowMs = 10_000;

  detector.systemHistory = [
    {
      timestampMs: nowMs - 250,
      durationMs: 120,
      rms: 0.02,
      samples: new Float32Array(2400),
    },
  ];

  detector.micHistory = [
    {
      timestampMs: nowMs - 420,
      durationMs: 120,
      rms: 0.02,
      correlation: 0.77,
      residualRatio: 0.4,
      explainedRatio: 0.6,
      systemRms: 0.02,
      micToSystemRatio: 1.1,
      state: "double_talk",
    },
    {
      timestampMs: nowMs - 300,
      durationMs: 120,
      rms: 0.02,
      correlation: 0.15,
      residualRatio: 0.9,
      explainedRatio: 0.1,
      systemRms: 0.02,
      micToSystemRatio: 1.1,
      state: "clean_local",
    },
    {
      timestampMs: nowMs - 180,
      durationMs: 120,
      rms: 0.02,
      correlation: 0.1,
      residualRatio: 0.95,
      explainedRatio: 0.05,
      systemRms: 0.02,
      micToSystemRatio: 1.1,
      state: "clean_local",
    },
    {
      timestampMs: nowMs - 60,
      durationMs: 120,
      rms: 0.02,
      correlation: 0.2,
      residualRatio: 0.85,
      explainedRatio: 0.15,
      systemRms: 0.02,
      micToSystemRatio: 1.1,
      state: "clean_local",
    },
  ];

  const result = detector.shouldSuppressMicSegment(nowMs - 500, nowMs);

  expect(result.suppress).toBe(false);
  expect(result.reason).toBe("double_talk");
  expect(result.hasBleedEvidence).toBe(true);
  expect(result.likelyRenderBleed).toBe(false);
  expect(result.bleedMatchCount).toBe(1);
  expect(result.sampleCount).toBe(4);
});
