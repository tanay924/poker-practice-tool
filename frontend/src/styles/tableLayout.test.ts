import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
const playPage = readFileSync(new URL("../pages/PlayPage.tsx", import.meta.url), "utf8");
const analysisDetailPage = readFileSync(new URL("../pages/AnalysisDetailPage.tsx", import.meta.url), "utf8");
const preflopPracticePage = readFileSync(new URL("../pages/PreflopPracticePage.tsx", import.meta.url), "utf8");

function assertWithinSectionOrder(source: string, sectionStart: string, first: string, second: string) {
  const startIndex = source.indexOf(sectionStart);
  assert.notEqual(startIndex, -1, `Missing ${sectionStart}`);
  const firstIndex = source.indexOf(first, startIndex);
  const secondIndex = source.indexOf(second, startIndex);
  assert.notEqual(firstIndex, -1, `Missing ${first} after ${sectionStart}`);
  assert.notEqual(secondIndex, -1, `Missing ${second} after ${sectionStart}`);
  assert.ok(firstIndex < secondIndex, `${first} should appear before ${second} in ${sectionStart}`);
}

assert.match(playPage, /className="table-center"/);
assertWithinSectionOrder(playPage, 'className="seat villain-seat"', 'className="cards"', 'className="seat-label"');
assertWithinSectionOrder(playPage, 'className="seat villain-seat"', 'className="seat-stack"', 'className="seat-label"');
assertWithinSectionOrder(analysisDetailPage, 'className="snapshot-seat snapshot-villain"', 'className="cards"', 'className="seat-label"');
assert.match(preflopPracticePage, /className={`seat preflop-seat \$\{stackPlacement === "above" \? "top-seat" : "bottom-seat"\}`}/);
assertWithinSectionOrder(preflopPracticePage, 'stackPlacement === "above"', 'className="cards"', 'className="seat-label"');
assertWithinSectionOrder(preflopPracticePage, 'stackPlacement === "above"', 'className="seat-stack"', 'className="seat-label"');

assert.match(css, /\.table-surface:not\(\.preflop-table\)\s*{[^}]*grid-template-areas:\s*"villain"\s*"board"\s*"hero"/s);
assert.match(css, /\.table-surface:not\(\.preflop-table\)\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/s);
assert.match(css, /\.villain-seat\s*{[^}]*grid-area:\s*villain[^}]*align-self:\s*end/s);
assert.match(css, /\.hero-seat\s*{[^}]*grid-area:\s*hero[^}]*align-self:\s*start/s);
assert.match(css, /\.table-center\s*{[^}]*grid-area:\s*board/s);
assert.match(css, /\.table-center\s*{[^}]*position:\s*relative/s);
assert.match(css, /\.table-center\s+\.pot-display\s*{[^}]*position:\s*absolute/s);
assert.match(css, /\.preflop-table\s*{[^}]*grid-template-areas:\s*"villain"\s*"center"\s*"hero"/s);
assert.match(css, /\.preflop-table\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/s);
assert.match(css, /\.preflop-table\s+\.top-seat\s*{[^}]*grid-area:\s*villain[^}]*align-self:\s*end/s);
assert.match(css, /\.preflop-table\s+\.bottom-seat\s*{[^}]*grid-area:\s*hero[^}]*align-self:\s*start/s);
assert.match(css, /\.preflop-table\s+\.preflop-center\s*{[^}]*grid-area:\s*center/s);

assert.match(css, /\.hand-table-snapshot\s*{[^}]*grid-template-areas:\s*"villain"\s*"board"\s*"hero"/s);
assert.match(css, /\.hand-table-snapshot\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/s);
assert.match(css, /\.snapshot-villain\s*{[^}]*grid-area:\s*villain[^}]*align-self:\s*end/s);
assert.match(css, /\.snapshot-hero\s*{[^}]*grid-area:\s*hero[^}]*align-self:\s*start/s);
assert.match(css, /\.snapshot-board\s*{[^}]*grid-area:\s*board/s);
assert.match(css, /\.snapshot-pot\s*{[^}]*position:\s*absolute/s);

console.log("table layout tests passed");
