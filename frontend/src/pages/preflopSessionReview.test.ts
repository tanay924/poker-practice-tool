import assert from "node:assert/strict";

import { preflopSessionReviewFor } from "./preflopSessionReview";

const feedback = {
  action: "fold" as const,
  correct: false,
  handKey: "65o",
  options: [
    { action: "fold" as const, probability: 0 },
    { action: "limp" as const, probability: 0.1 },
    { action: "raise" as const, probability: 0.9 }
  ],
  selectedProbability: 0,
  spotId: "HU_SB_OPEN_100BB" as const,
  spotName: "SB first action"
};

assert.equal(preflopSessionReviewFor({ isComplete: false, lastFeedback: feedback }), null);
assert.deepEqual(
  preflopSessionReviewFor({ isComplete: true, lastFeedback: feedback }),
  {
    eyebrow: "Next leak to drill",
    title: "Review 65o in SB first action",
    message: "Fold has 0% frequency here. Compare the range, then practice this exact spot again."
  }
);

assert.deepEqual(
  preflopSessionReviewFor({
    isComplete: true,
    lastFeedback: { ...feedback, action: "raise", correct: true, selectedProbability: 0.9 }
  }),
  {
    eyebrow: "Pattern to keep",
    title: "Raise is in range here",
    message: "65o uses Raise at 90% in this spot. Repeat it once more to make the pattern automatic."
  }
);

console.log("preflop session review tests passed");
