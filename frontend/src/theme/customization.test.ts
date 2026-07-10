import assert from "node:assert/strict";

import {
  APP_THEME_OPTIONS,
  CARD_THEME_OPTIONS,
  DEFAULT_THEME_SELECTION,
  TABLE_THEME_OPTIONS,
  applyThemeSelection,
  loadThemeSelection,
  saveThemeSelection
} from "./customization";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = 0;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.length = this.values.size;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.length = this.values.size;
  }
}

const storage = new MemoryStorage();

assert.equal(APP_THEME_OPTIONS.length >= 6, true);
assert.equal(TABLE_THEME_OPTIONS.length >= 6, true);
assert.equal(CARD_THEME_OPTIONS.length >= 5, true);
assert.deepEqual(loadThemeSelection(storage), DEFAULT_THEME_SELECTION);

saveThemeSelection({ app: "neon", cards: "slate", table: "aubergine" }, storage);
assert.deepEqual(loadThemeSelection(storage), { app: "neon", cards: "slate", table: "aubergine" });

storage.setItem("poker-trainer-theme-selection", JSON.stringify({ app: "missing", cards: "neon", table: "sand" }));
assert.deepEqual(loadThemeSelection(storage), { app: "classic", cards: "neon", table: "sand" });

storage.setItem("poker-trainer-theme-selection", "not json");
assert.deepEqual(loadThemeSelection(storage), DEFAULT_THEME_SELECTION);

const element = {
  dataset: {} as DOMStringMap
} as HTMLElement;
applyThemeSelection(element, { app: "ocean", cards: "high-contrast", table: "royal-blue" });
assert.equal(element.dataset.appTheme, "ocean");
assert.equal(element.dataset.cardTheme, "high-contrast");
assert.equal(element.dataset.tableTheme, "royal-blue");

console.log("customization theme tests passed");
