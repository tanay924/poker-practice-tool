export type AppThemeId = "classic" | "midnight" | "neon" | "sunset" | "ocean" | "minimal";
export type TableThemeId = "emerald" | "royal-blue" | "aubergine" | "charcoal" | "candy" | "sand";
export type CardThemeId = "classic" | "cream" | "slate" | "neon" | "high-contrast";

export interface ThemeOption<T extends string> {
  description: string;
  id: T;
  label: string;
  swatches: string[];
}

export interface ThemeSelection {
  app: AppThemeId;
  cards: CardThemeId;
  table: TableThemeId;
}

export const THEME_STORAGE_KEY = "poker-trainer-theme-selection";

export const DEFAULT_THEME_SELECTION: ThemeSelection = {
  app: "classic",
  cards: "classic",
  table: "emerald"
};

export const APP_THEME_OPTIONS: ThemeOption<AppThemeId>[] = [
  { description: "Dark green, focused, familiar.", id: "classic", label: "Classic Club", swatches: ["#090d0b", "#0c7b50", "#f0c96a"] },
  { description: "Low glare for late study sessions.", id: "midnight", label: "Midnight", swatches: ["#070b18", "#24345c", "#9cc8ff"] },
  { description: "Bright arcade energy with sharp contrast.", id: "neon", label: "Neon Lab", swatches: ["#090817", "#00d4ff", "#ff4fd8"] },
  { description: "Warm, social, and relaxed.", id: "sunset", label: "Sunset Room", swatches: ["#160d12", "#e8613f", "#ffd166"] },
  { description: "Cool blues for a calmer table.", id: "ocean", label: "Ocean", swatches: ["#06131a", "#0077b6", "#7bdff2"] },
  { description: "Quiet and clean with less visual weight.", id: "minimal", label: "Minimal", swatches: ["#111111", "#f4f1ea", "#83c5be"] }
];

export const TABLE_THEME_OPTIONS: ThemeOption<TableThemeId>[] = [
  { description: "Traditional casino green.", id: "emerald", label: "Emerald", swatches: ["#0c7b50", "#07533b", "#25251f"] },
  { description: "Blue felt with crisp rails.", id: "royal-blue", label: "Royal Blue", swatches: ["#0f5ea8", "#08345e", "#172033"] },
  { description: "Purple felt for a richer room.", id: "aubergine", label: "Aubergine", swatches: ["#603b89", "#342051", "#24192e"] },
  { description: "Neutral, serious, and low glare.", id: "charcoal", label: "Charcoal", swatches: ["#29313a", "#151a21", "#111111"] },
  { description: "Playful pink and teal felt.", id: "candy", label: "Candy", swatches: ["#e75aa6", "#00a7a5", "#34213b"] },
  { description: "Soft warm felt for a lighter space.", id: "sand", label: "Sand", swatches: ["#c49a5a", "#8b663b", "#473523"] }
];

export const CARD_THEME_OPTIONS: ThemeOption<CardThemeId>[] = [
  { description: "White cards with standard suits.", id: "classic", label: "Classic", swatches: ["#fffaf0", "#b72f3d", "#151915"] },
  { description: "Warm paper tone with softer contrast.", id: "cream", label: "Cream", swatches: ["#f4e4bf", "#a83f38", "#263029"] },
  { description: "Dark card faces for low-light play.", id: "slate", label: "Slate", swatches: ["#26313a", "#ff7f8c", "#f5f7f2"] },
  { description: "Electric card backs and brighter suits.", id: "neon", label: "Neon", swatches: ["#101020", "#ff4fd8", "#00e0ff"] },
  { description: "Maximum legibility.", id: "high-contrast", label: "High Contrast", swatches: ["#ffffff", "#d00000", "#000000"] }
];

export function loadThemeSelection(storage: Pick<Storage, "getItem"> = window.localStorage): ThemeSelection {
  const stored = storage.getItem(THEME_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_THEME_SELECTION;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<ThemeSelection>;
    return normalizeThemeSelection(parsed);
  } catch {
    return DEFAULT_THEME_SELECTION;
  }
}

export function saveThemeSelection(selection: ThemeSelection, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  storage.setItem(THEME_STORAGE_KEY, JSON.stringify(selection));
}

export function applyThemeSelection(target: HTMLElement, selection: ThemeSelection): void {
  target.dataset.appTheme = selection.app;
  target.dataset.tableTheme = selection.table;
  target.dataset.cardTheme = selection.cards;
}

export function normalizeThemeSelection(selection: Partial<ThemeSelection>): ThemeSelection {
  return {
    app: optionExists(APP_THEME_OPTIONS, selection.app) ? selection.app : DEFAULT_THEME_SELECTION.app,
    cards: optionExists(CARD_THEME_OPTIONS, selection.cards) ? selection.cards : DEFAULT_THEME_SELECTION.cards,
    table: optionExists(TABLE_THEME_OPTIONS, selection.table) ? selection.table : DEFAULT_THEME_SELECTION.table
  };
}

function optionExists<T extends string>(options: ThemeOption<T>[], id: string | undefined): id is T {
  return options.some((option) => option.id === id);
}
