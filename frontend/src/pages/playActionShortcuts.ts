import type { TrainerAction } from "../poker/engine";

export interface PlayShortcutHint {
  aria: string;
  label: string;
}

export function playShortcutForAction(action: TrainerAction, index: number, actions: TrainerAction[]): PlayShortcutHint {
  const keys = [...semanticShortcutKeys(action, actions), String(index + 1)];
  return {
    aria: keys.join(" "),
    label: keys.map((key) => key.toUpperCase()).join(" / ")
  };
}

export function resolvePlayShortcut(key: string, actions: TrainerAction[]): TrainerAction | null {
  const normalized = normalizeKey(key);
  if (!normalized) {
    return null;
  }

  if (/^[1-9]$/.test(normalized)) {
    return actions[Number(normalized) - 1] ?? null;
  }

  const matches = actions.filter((action) => semanticShortcutKeys(action, actions).includes(normalized));
  return matches.length === 1 ? matches[0] : null;
}

function semanticShortcutKeys(action: TrainerAction, actions: TrainerAction[]): string[] {
  if (action.action === "fold") {
    return ["f"];
  }
  if (action.action === "check" || action.action === "call" || action.action === "limp") {
    return ["c"];
  }
  if (action.action === "bet" || action.action === "raise" || action.action === "raise_to") {
    const raiseOrBetCount = actions.filter((candidate) => candidate.action === "bet" || candidate.action === "raise" || candidate.action === "raise_to").length;
    return raiseOrBetCount === 1 ? ["r"] : [];
  }
  return [];
}

function normalizeKey(key: string): string | null {
  const normalized = key.trim().toLowerCase();
  return normalized.length === 1 ? normalized : null;
}
