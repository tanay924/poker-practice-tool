import type { AnalysisJob, HandRead } from "../types";

export interface AnalysisControl {
  disabled: boolean;
  href?: string;
  label: string;
  mode: "analyze" | "view";
}

export function analysisControlFor(
  savedHand: Pick<HandRead, "id"> | null,
  analysisJob: Pick<AnalysisJob, "status"> | null
): AnalysisControl | null {
  if (!savedHand) {
    return null;
  }

  if (analysisJob?.status === "ready") {
    return {
      disabled: false,
      href: `/analysis/${savedHand.id}`,
      label: "View analysis",
      mode: "view"
    };
  }

  return {
    disabled: analysisJob?.status === "queued" || analysisJob?.status === "solving",
    label: "Analyze hand",
    mode: "analyze"
  };
}
