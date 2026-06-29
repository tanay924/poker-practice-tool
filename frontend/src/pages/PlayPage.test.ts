import assert from "node:assert/strict";

import { analysisControlFor } from "./playAnalysisControl";

{
  assert.equal(analysisControlFor(null, null), null);
}

{
  const control = analysisControlFor({ id: 42 }, null);

  assert.deepEqual(control, {
    disabled: false,
    label: "Analyze hand",
    mode: "analyze"
  });
}

{
  const control = analysisControlFor({ id: 42 }, { status: "solving" });

  assert.deepEqual(control, {
    disabled: true,
    label: "Analyze hand",
    mode: "analyze"
  });
}

{
  const control = analysisControlFor({ id: 42 }, { status: "ready" });

  assert.deepEqual(control, {
    disabled: false,
    href: "/analysis/42",
    label: "View analysis",
    mode: "view"
  });
}

console.log("play page tests passed");
