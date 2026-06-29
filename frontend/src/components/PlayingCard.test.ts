import assert from "node:assert/strict";

import { cardPresentation } from "./PlayingCard";

{
  const ace = cardPresentation("Ad");

  assert.equal(ace.rank, "A");
  assert.equal(ace.suit, "d");
  assert.equal(ace.symbol, "♦");
  assert.equal(ace.colorClass, "red");
  assert.equal(ace.isPlaceholder, false);
}

{
  const ten = cardPresentation("Ts");

  assert.equal(ten.rank, "10");
  assert.equal(ten.symbol, "♠");
  assert.equal(ten.colorClass, "black");
}

{
  const hidden = cardPresentation("??");

  assert.equal(hidden.rank, "");
  assert.equal(hidden.symbol, "◆");
  assert.equal(hidden.isPlaceholder, true);
}

console.log("playing card tests passed");
