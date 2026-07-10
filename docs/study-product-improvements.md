# Poker Trainer Product Improvement Notes

Date: 2026-06-30

These notes collect medium-term UX and feature ideas for turning the trainer from "play a hand, get an answer" into a stronger poker study loop.

## Product Direction

The most useful version of the app should help a user choose a spot, play multiple hands, get specific leak feedback, then drill the exact weakness. The goal is not just to show whether one hand was right or wrong. The goal is to help the user build repeatable pattern recognition.

## Highest-Leverage Improvements

1. Session goals

   Add a setup panel for `Play` and `Preflop` with choices like:

   - Quick mixed session
   - SB focus
   - BB focus
   - Limped pots
   - 3-bet pots
   - Weak spots only

   A user should know what skill they are training before cards appear.

2. Decision-by-decision review

   On the analysis page, make every hero decision a clean review card:

   - Street
   - Board
   - Hero hand
   - Hero action
   - Solver preferred action mix
   - Frequency
   - EV or mistake severity, when available
   - Plain-English note

   The main question the page should answer quickly is: "Where did I lose value strategically?"

3. Replay hand timeline

   Add a scrubber or street timeline in analysis:

   - Preflop
   - Flop
   - Turn
   - River

   Each step should show the table state at that decision, not only the final hand state. This would make analysis much easier to learn from.

4. Leak dashboard

   Track patterns across hands:

   - Position: SB versus BB
   - Spot: single-raised pot, limped pot, 3-bet pot
   - Street
   - Action type: overfolding, overcalling, missed value, bad bluff, bad call
   - Board texture

   This is probably the biggest upgrade for making the app feel like a serious study tool.

5. Spaced repetition for preflop

   Remember missed combos and resurface them more often. If a user keeps missing `K7o` versus a 3-bet, show that hand again later.

   This turns range practice from quiz mode into actual memory training.

6. Clear supported solver profile

   Show a subtle training profile somewhere, probably in settings or analysis metadata:

   - Shark version
   - Supported postflop bet sizes
   - Whether postflop raises are enabled
   - Current preflop range set
   - Current solver timeout and accuracy profile

   This makes limitations feel intentional instead of surprising.

7. Better action labels

   Keep labels natural everywhere:

   - Check
   - Bet 33%
   - Bet 75%
   - Call 5bb
   - Raise to 11.5bb
   - All-in

   Avoid internal labels in user-facing views.

8. Hand tags and notes

   Let users mark hands:

   - Review later
   - Confusing
   - Big mistake
   - Interesting spot

   Add a small note field. Poker study is naturally notebook-like.

9. Post-session summary

   After a block of hands, show a short report:

   - Decisions played correctly
   - Biggest leak
   - Most costly hand
   - Recommended next drill

   Example:

   - `You played 18/25 decisions correctly.`
   - `Biggest leak: BB flop calls.`
   - `Most costly hand: #42.`
   - `Recommended next drill: BB versus SB open.`

10. Keyboard shortcuts

   Add optional shortcuts for faster grinding:

   - `F` for fold
   - `C` for check/call
   - `R` for raise/bet
   - Number keys for sizing choices

   These should stay subtle, probably in tooltips or settings rather than visible instructional text on the table.

## Suggested Priority Order

1. Analysis decision cards
2. Session and leak dashboard
3. Preflop spaced repetition
4. Hand replay timeline
5. More action and sizing diversity after solver support can keep up

This order improves learning quality before adding more strategic complexity.

## Equity Display Idea

Adding equity percentages could be useful, but it needs careful design. Equity can teach the wrong lesson if it is presented without context, because raw hand equity is not the same as EV, realization, position, or optimal strategy.

### Recommendation

Start with postflop equity in analysis only.

Use it as context beside each postflop hero decision, not as a verdict. The solver recommendation should remain the verdict.

Do not show equity during live play. That would train with information a player does not have in-game.

### Product Shape

For each analysis decision card, show a compact equity bar:

```text
Equity now
Hero 42% | Opponent 58%
Source: Hero hand versus opponent range
```

This should sit near the board and action recommendation. It should feel like a supporting clue, not the main score.

### Exact-Card Equity Versus Range Equity

There are three possible equity definitions:

1. Exact hand versus exact hand

   This is fastest and easiest. Given both hole cards and the board, enumerate all remaining runouts and calculate each player's share.

   This is useful at showdown, or when both hands are intentionally revealed.

   It should not be used for folded non-showdown hands unless the UI is explicitly allowed to reveal villain's hole cards. Otherwise it leaks hidden cards and contradicts the current hand-visibility model.

2. Hero hand versus opponent range

   This is the best MVP for analysis.

   It answers: "Given my actual hand, how much equity did I have against the opponent's likely range at this decision?"

   This is more educational than exact-card equity because it matches how poker decisions are made.

3. Range versus range

   This is the most solver-like version.

   It answers: "How much equity does each player's whole range have in this node?"

   This is useful for advanced study, but it is less personal to the exact hand the user played.

### Postflop Implementation

The backend analysis pipeline should compute and store equity in `solver_output_json`, probably inside each `street_results` item.

Suggested shape:

```json
{
  "equity": {
    "hero": 0.42,
    "opponent": 0.58,
    "source": "hero_hand_vs_opponent_range",
    "board": ["Ah", "Jh", "9d"],
    "street": "flop"
  }
}
```

Implementation pieces:

1. Add a backend equity calculator.
2. Port or share the existing frontend Hold'em hand evaluator logic.
3. Build weighted opponent combo sets from the same branch-specific ranges used for Shark.
4. Remove known dead cards: hero hand, board, and optionally revealed villain cards.
5. Enumerate remaining runouts exactly for flop, turn, and river.
6. Weight results by combo frequency.
7. Store the result in the analysis output.
8. Render a compact equity bar in each decision card.

Postflop exact enumeration is very feasible locally:

| Street | Unknown board cards | Workload |
| --- | ---: | --- |
| Flop | 2 | Small enough for exact enumeration |
| Turn | 1 | Very small |
| River | 0 | Direct hand comparison |

### Preflop Implementation

Preflop equity is possible, but it is less urgent.

In preflop training, the primary learning target is the range action frequency. A hand can have decent raw equity and still be a fold because of position, realization, stack depth, and future-node strategy.

If added, preflop equity should be shown only after the user answers, and it should be labelled carefully:

```text
Raw preflop equity versus range: Hero 46%
Action frequency remains the scoring source.
```

For preflop, exact range enumeration is heavier because there are five unknown board cards. Options:

1. Precompute common combo-versus-range equity tables.
2. Use Monte Carlo sampling for a fast approximate number.
3. Run exact enumeration only for small ranges or cached common spots.

### Recommended Equity Roadmap

1. Add exact hand-versus-hand equity for showdown/revealed-card analysis.
2. Add postflop hero-hand-versus-opponent-range equity for each analysis decision.
3. Add optional preflop raw equity after answering in `/preflop`.
4. Consider advanced range-versus-range equity later if Shark exposes enough node data cleanly.

### Important UX Warnings

Equity should not replace solver feedback.

Avoid implying that a high-equity hand must bet or call. The UI should make clear that equity is context, while solver action mix is the strategic recommendation.

Avoid revealing hidden opponent cards through equity numbers. For non-showdown folds, use range equity rather than exact-card equity.
