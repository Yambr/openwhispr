// Uses globals enabled in vitest.config.ts (test, expect available without import).

const { transcriptsOverlap, transcriptsLooselyOverlap } = require("../../src/helpers/transcriptText");

test("transcriptsOverlap matches near-duplicate meeting transcripts", () => {
  expect(
    transcriptsOverlap(
      "a distribution mechanism? Is it a future product? Is it one of N ways people are",
      "mechanism as a future product? Is it one of the ways we are going to interact wi"
    )
  ).toBe(true);

  expect(
    transcriptsOverlap(
      "with the world? I feel like in search with every shift, you're able to do more w",
      "I feel like in search with every step you're able to do more."
    )
  ).toBe(true);
});

test("transcriptsOverlap stays conservative for short generic fragments", () => {
  expect(transcriptsOverlap("and you know we have", "you know, be a...")).toBe(false);
  expect(transcriptsOverlap("Thank you.", "Thanks.")).toBe(false);
});

test("transcriptsLooselyOverlap catches chunk-boundary paraphrases without matching filler", () => {
  expect(
    transcriptsLooselyOverlap(
      "or just information-seeking queries, will be agent-taken search, You'll be completing tasks, you'll have many threads running. Well, search exist",
      "The inquiry will be agent in search. You will be completing"
    )
  ).toBe(true);

  expect(
    transcriptsLooselyOverlap(
      "You'll be completing tasks, you'll have many threads running. Well, search exist in 10 years? Well, you know, you may... Or it just evolves into something else.",
      "I don't see that many threads running. So, it takes us 10 years? What?"
    )
  ).toBe(true);

  expect(transcriptsLooselyOverlap("and you know we have", "you know, be a...")).toBe(false);
});
