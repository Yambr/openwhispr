// Uses globals enabled in vitest.config.ts (test, expect, describe available without import).
//
// Vitest port of upstream OpenWhispr #835 (commit 69cb74be) tests for
// shouldSkipTranscriptionApiKey. Helper logic is verbatim upstream; only the
// test harness is adapted from node:test → vitest (project convention).
import { shouldSkipTranscriptionApiKey } from "../../src/helpers/transcriptionAuth.js";

describe("shouldSkipTranscriptionApiKey", () => {
  it("returns true for self-hosted mode with a configured remote URL", () => {
    expect(
      shouldSkipTranscriptionApiKey({
        transcriptionMode: "self-hosted",
        remoteTranscriptionUrl: "http://localhost:8000/v1",
      })
    ).toBe(true);
  });

  it("returns false for self-hosted mode with an empty remote URL", () => {
    expect(
      shouldSkipTranscriptionApiKey({
        transcriptionMode: "self-hosted",
        remoteTranscriptionUrl: "",
      })
    ).toBe(false);
  });

  it("returns false for self-hosted mode with a whitespace-only remote URL", () => {
    expect(
      shouldSkipTranscriptionApiKey({
        transcriptionMode: "self-hosted",
        remoteTranscriptionUrl: "   ",
      })
    ).toBe(false);
  });

  it("returns false for the default cloud (openai) configuration", () => {
    expect(
      shouldSkipTranscriptionApiKey({
        transcriptionMode: "",
        cloudTranscriptionProvider: "openai",
        remoteTranscriptionUrl: "",
      })
    ).toBe(false);
  });

  it("returns false when transcriptionMode is missing", () => {
    expect(shouldSkipTranscriptionApiKey({})).toBe(false);
  });

  it("returns false for cloud mode even with a remote URL set", () => {
    expect(
      shouldSkipTranscriptionApiKey({
        transcriptionMode: "cloud",
        remoteTranscriptionUrl: "http://localhost:8000/v1",
      })
    ).toBe(false);
  });
});
