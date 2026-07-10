import { Link } from "react-router-dom";

const steps = [
  ["Play a real decision", "Work through a focused 100bb heads-up hand with only the information a player should have."],
  ["Save the answer sheet", "Leave the table immediately; analysis runs in the background so the study loop does not interrupt practice."],
  ["Find the pattern", "Review the exact decision, solver mix, pot odds, equity context, and similar tagged study spots."],
];

export default function LandingPage() {
  return (
    <section className="landing-page stack">
      <div className="landing-hero panel">
        <p className="eyebrow">Heads-up study lab</p>
        <h2>Play the hand. Understand the decision.</h2>
        <p className="landing-lede">A focused poker trainer for building repeatable pattern recognition across preflop ranges and postflop decisions.</p>
        <div className="landing-actions">
          <Link className="button-link" to="/play">Play a hand</Link>
          <Link className="button-link secondary" to="/preflop">Drill preflop</Link>
        </div>
        <p className="muted-text landing-note">Current profile: heads-up no-limit hold'em, 100bb, SB versus BB.</p>
      </div>

      <div className="landing-step-grid">
        {steps.map(([title, detail], index) => (
          <article className="panel landing-step" key={title}>
            <span className="landing-step-number">{index + 1}</span>
            <h3>{title}</h3>
            <p>{detail}</p>
          </article>
        ))}
      </div>

      <div className="landing-two-column">
        <section className="panel">
          <p className="eyebrow">Study loop</p>
          <h3>Train the leak, not just the hand</h3>
          <p>Every completed analysis becomes a decision review. Use the hand library, stats dashboard, and similar spots to turn one mistake into deliberate practice.</p>
          <Link className="text-link" to="/methodology">See how the analysis works</Link>
        </section>
        <section className="panel">
          <p className="eyebrow">Start without friction</p>
          <h3>Play as a guest or keep a private library</h3>
          <p>Guests can try the local practice loop. Sign in when you want saved answer sheets, stats, sharing, and longer-term progress.</p>
          <Link className="text-link" to="/auth">Create an account</Link>
        </section>
      </div>
    </section>
  );
}
