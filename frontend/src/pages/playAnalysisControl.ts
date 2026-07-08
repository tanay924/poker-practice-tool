import type { AnalysisJob, HandRead } from "../types";

export interface AnalysisControl {
  disabled: boolean;
  href?: string;
  label: string;
  mode: "analyze" | "view";
}

export interface PlayAnalysisState<TJob> {
  analysisJob: TJob | null;
  error: string | null;
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

export function nextPlayAnalysisStateAfterRefresh<TJob>(
  _current: PlayAnalysisState<TJob>,
  detail: { job: TJob | null }
): PlayAnalysisState<TJob> {
  return {
    analysisJob: detail.job,
    error: null
  };
}

export function nextPlayAnalysisStateAfterAnalyzeSuccess<TJob>(
  _current: PlayAnalysisState<TJob>,
  job: TJob
): PlayAnalysisState<TJob> {
  return {
    analysisJob: job,
    error: null
  };
}
