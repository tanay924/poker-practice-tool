import { actionLabel, type PreflopRoundState } from "../preflop/engine";

export interface PreflopSessionReview {
  message: string;
  title: string;
  eyebrow: string;
}

export function preflopSessionReviewFor(
  round: Pick<PreflopRoundState, "isComplete" | "lastFeedback">
): PreflopSessionReview | null {
  if (!round.isComplete || !round.lastFeedback) {
    return null;
  }

  const feedback = round.lastFeedback;
  const selectedFrequency = Math.round(feedback.selectedProbability * 100);
  if (feedback.correct) {
    return {
      eyebrow: "Pattern to keep",
      title: `${actionLabel(feedback.action)} is in range here`,
      message: `${feedback.handKey} uses ${actionLabel(feedback.action)} at ${selectedFrequency}% in this spot. Repeat it once more to make the pattern automatic.`
    };
  }

  return {
    eyebrow: "Next leak to drill",
    title: `Review ${feedback.handKey} in ${feedback.spotName}`,
    message: `${actionLabel(feedback.action)} has 0% frequency here. Compare the range, then practice this exact spot again.`
  };
}
