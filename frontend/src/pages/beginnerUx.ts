export interface NavigationItem {
  label: string;
  to: string;
}

export interface PlayGuideStep {
  detail: string;
  title: string;
}

export interface EmptyStateModel {
  actionLabel: string;
  actionTo: string | null;
  message: string;
  title: string;
}

export interface RangeIntroModel {
  eyebrow: string;
  subtitle: string;
  title: string;
}

export function primaryNavigationItems(): NavigationItem[] {
  return [
    { label: "Play hand", to: "/play" },
    { label: "Preflop drill", to: "/preflop" },
    { label: "Hand library", to: "/analysis" },
    { label: "Range charts", to: "/ranges" }
  ];
}

export function playGuideSteps(): PlayGuideStep[] {
  return [
    { detail: "Pick random, SB, or BB before the deal.", title: "Choose seat" },
    { detail: "Take each legal action as the hand unfolds.", title: "Play decisions" },
    { detail: "Finish the hand, then review the feedback.", title: "Review leaks" }
  ];
}

export function analysisEmptyState({ hasItems, hasQuery }: { hasItems: boolean; hasQuery: boolean }): EmptyStateModel {
  if (hasQuery) {
    return {
      actionLabel: "Clear filters",
      actionTo: null,
      message: "Try a different hand number, card, board, or status.",
      title: "No matching hands"
    };
  }
  if (!hasItems) {
    return {
      actionLabel: "Play a hand",
      actionTo: "/play",
      message: "Play one hand, then request analysis to build your library.",
      title: "No hands saved yet"
    };
  }
  return {
    actionLabel: "Clear filters",
    actionTo: null,
    message: "Try a different hand number, card, board, or status.",
    title: "No matching hands"
  };
}

export function rangePageIntro(): RangeIntroModel {
  return {
    eyebrow: "100bb heads-up cash",
    subtitle: "Use these as reference charts, then drill the same spots in Preflop.",
    title: "Range Charts"
  };
}
