import { ChangeEvent, useEffect, useState } from "react";

import { importRange, listRanges } from "../api";
import type { PreflopRange } from "../types";

export default function RangesPage() {
  const [ranges, setRanges] = useState<PreflopRange[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listRanges()
      .then((next) => {
        setRanges(next);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text());
      const imported = await importRange(payload);
      setMessage(`Imported ${imported.name}`);
      setError(null);
      refresh();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="stack">
      <div className="page-heading">
        <p className="eyebrow">User-provided strategy files</p>
        <h2>Ranges</h2>
      </div>

      <label className="upload-box">
        <span>Import JSON range</span>
        <input type="file" accept="application/json,.json" onChange={handleFile} />
      </label>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="range-grid">
        {ranges.map((range) => (
          <article className="panel" key={range.id}>
            <div className="range-header">
              <div>
                <h3>{range.name}</h3>
                <p>{range.spot} · {range.stack_bb}bb · {range.source}</p>
              </div>
              <span className="status-pill">{Object.keys(range.range_json.actions).length} hands</span>
            </div>
            <div className="combo-table">
              {Object.entries(range.range_json.actions).slice(0, 8).map(([combo, actions]) => (
                <div key={combo}>
                  <strong>{combo}</strong>
                  <span>
                    {Object.entries(actions)
                      .map(([action, frequency]) => `${action} ${Math.round(frequency * 100)}%`)
                      .join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
