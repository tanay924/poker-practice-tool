import { useMemo, useState } from "react";

import type { PreflopAction } from "../preflop/engine";
import { listBundledPreflopRanges, type BundledPreflopRange } from "../preflop/rangeData";
import {
  actionPresentation,
  buildRangeMatrix,
  formatProbability,
  MATRIX_RANKS,
  rangePresentationForSpot,
  segmentSummary,
  type RangeActionSegment
} from "../preflop/rangeMatrix";
import { rangeTabItems, selectedRangeForSpot } from "./rangeStudyNavigation";

const ACTION_ORDER: PreflopAction[] = ["fold", "check", "limp", "call", "raise", "allin"];

export default function RangesPage() {
  const ranges = useMemo(() => listBundledPreflopRanges(), []);
  const tabs = useMemo(() => rangeTabItems(ranges), [ranges]);
  const [selectedSpot, setSelectedSpot] = useState<string>(() => ranges[0]?.spot ?? "");
  const selectedRange = selectedRangeForSpot(ranges, selectedSpot);

  return (
    <section className="stack range-study-page">
      <div className="page-heading">
        <p className="eyebrow">Bundled 100bb HU cash ranges</p>
        <h2>Ranges</h2>
      </div>

      <div className="range-legend panel">
        {ACTION_ORDER.map((action) => {
          const presentation = actionPresentation(action);
          return (
            <span key={action}>
              <i style={{ backgroundColor: presentation.color }} />
              {presentation.label}
            </span>
          );
        })}
      </div>

      <div className="range-tabs panel" role="tablist" aria-label="Range spot">
        {tabs.map((tab) => (
          <button
            aria-selected={selectedRange?.spot === tab.spot}
            className={selectedRange?.spot === tab.spot ? "active secondary" : "secondary"}
            key={tab.spot}
            onClick={() => setSelectedSpot(tab.spot)}
            role="tab"
            type="button"
          >
            <span>{tab.title}</span>
            <small>{tab.stackBb}bb</small>
          </button>
        ))}
      </div>

      <div className="range-table-stack">
        {selectedRange && <RangeChart key={selectedRange.spot} range={selectedRange} />}
      </div>
    </section>
  );
}

function RangeChart({ range }: { range: BundledPreflopRange }) {
  const presentation = rangePresentationForSpot(range.spot);
  const matrix = buildRangeMatrix(range);
  return (
    <article className="range-chart panel">
      <div className="range-header">
        <div>
          <h3>{presentation.title}</h3>
          <p>{presentation.detail}</p>
        </div>
        <span className="status-pill">{range.stackBb}bb</span>
      </div>

      <div className="range-matrix-wrap">
        <div className="range-matrix" aria-label={`${presentation.title} range table`} role="grid">
          <div className="range-axis-corner" />
          {MATRIX_RANKS.map((rank) => (
            <div className="range-axis range-axis-top" key={`top-${rank}`}>
              {rank}
            </div>
          ))}
          {MATRIX_RANKS.map((rank, row) => (
            <RowCells cells={matrix.filter((cell) => cell.row === row)} key={`row-${rank}`} rangeSpot={range.spot} rowLabel={rank} />
          ))}
        </div>
      </div>
    </article>
  );
}

function RowCells({
  cells,
  rangeSpot,
  rowLabel
}: {
  cells: ReturnType<typeof buildRangeMatrix>;
  rangeSpot: string;
  rowLabel: string;
}) {
  return (
    <>
      <div className="range-axis range-axis-left">{rowLabel}</div>
      {cells.map((cell) => {
        const label = `${cell.handKey}: ${segmentSummary(cell.segments) || "No action"}`;
        return (
          <div
            aria-label={label}
            className={`range-cell ${cell.segments.length === 0 ? "empty" : ""}`}
            key={`${rangeSpot}-${cell.handKey}`}
            role="gridcell"
            style={{ background: cell.background }}
            tabIndex={0}
            title={label}
          >
            <strong>{cell.handKey}</strong>
            <span>{compactCellSummary(cell.segments)}</span>
          </div>
        );
      })}
    </>
  );
}

function compactCellSummary(segments: RangeActionSegment[]): string {
  if (segments.length === 0) {
    return "-";
  }
  if (segments.length === 1) {
    return `${segments[0].label[0]} ${formatProbability(segments[0].probability)}`;
  }
  return segments.map((segment) => `${segment.label[0]}${formatProbability(segment.probability)}`).join(" ");
}
