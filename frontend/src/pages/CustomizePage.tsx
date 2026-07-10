import { useEffect, useState } from "react";

import {
  APP_THEME_OPTIONS,
  CARD_THEME_OPTIONS,
  DEFAULT_THEME_SELECTION,
  TABLE_THEME_OPTIONS,
  applyThemeSelection,
  loadThemeSelection,
  saveThemeSelection,
  type ThemeOption,
  type ThemeSelection
} from "../theme/customization";

type ThemeCategory = keyof ThemeSelection;

export default function CustomizePage() {
  const [selection, setSelection] = useState<ThemeSelection>(() => safeLoadThemeSelection());

  useEffect(() => {
    applyThemeSelection(document.documentElement, selection);
    saveThemeSelection(selection);
  }, [selection]);

  const chooseTheme = <T extends ThemeCategory>(category: T, value: ThemeSelection[T]) => {
    setSelection((current) => ({ ...current, [category]: value }));
  };

  const resetThemes = () => {
    setSelection(DEFAULT_THEME_SELECTION);
  };

  return (
    <section className="stack customize-page">
      <div className="customize-heading">
        <div className="page-heading">
          <p className="eyebrow">Study space</p>
          <h2>Customize</h2>
          <p className="page-subtitle">Choose a table, card deck, and app mood that make studying feel comfortable.</p>
        </div>
        <button className="secondary compact-button" onClick={resetThemes} type="button">
          Reset
        </button>
      </div>

      <ThemeSection
        category="app"
        heading="App Theme"
        options={APP_THEME_OPTIONS}
        selected={selection.app}
        onChoose={(value) => chooseTheme("app", value)}
      />
      <ThemeSection
        category="table"
        heading="Table Felt"
        options={TABLE_THEME_OPTIONS}
        selected={selection.table}
        onChoose={(value) => chooseTheme("table", value)}
      />
      <ThemeSection
        category="cards"
        heading="Card Style"
        options={CARD_THEME_OPTIONS}
        selected={selection.cards}
        onChoose={(value) => chooseTheme("cards", value)}
      />
    </section>
  );
}

function ThemeSection<T extends string>({
  category,
  heading,
  onChoose,
  options,
  selected
}: {
  category: string;
  heading: string;
  onChoose: (value: T) => void;
  options: ThemeOption<T>[];
  selected: T;
}) {
  return (
    <section className="theme-section">
      <div className="range-header">
        <div>
          <h3>{heading}</h3>
          <p>{selectedLabel(options, selected)}</p>
        </div>
      </div>
      <div className="theme-option-grid">
        {options.map((option) => (
          <button
            aria-pressed={selected === option.id}
            className={`theme-option-card ${selected === option.id ? "active" : ""}`}
            key={option.id}
            onClick={() => onChoose(option.id)}
            type="button"
          >
            <span className="theme-swatch-row" aria-hidden="true">
              {option.swatches.map((color) => <i key={`${option.id}-${color}`} style={{ backgroundColor: color }} />)}
            </span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
            <span className="theme-selected-copy">{selected === option.id ? "Selected" : `Use ${category}`}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function selectedLabel<T extends string>(options: ThemeOption<T>[], selected: T) {
  return options.find((option) => option.id === selected)?.description ?? "";
}

function safeLoadThemeSelection() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_SELECTION;
  }
  return loadThemeSelection();
}
