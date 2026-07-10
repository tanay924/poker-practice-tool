import { Link } from "react-router-dom";

export default function MethodologyPage() {
  return (
    <section className="stack information-page">
      <div className="page-heading">
        <p className="eyebrow">Transparent training profile</p>
        <h2>How the trainer works</h2>
        <p className="page-subtitle">The app is intentionally narrow: a clear, repeatable heads-up study environment is more useful than pretending to support every poker tree.</p>
      </div>

      <section className="panel info-card">
        <h3>Supported game</h3>
        <ul>
          <li>Heads-up no-limit hold'em.</li>
          <li>100bb starting stacks.</li>
          <li>Small blind versus big blind positions.</li>
          <li>Bundled 100bb preflop ranges and supported postflop branches.</li>
        </ul>
      </section>

      <section className="panel info-card">
        <h3>What happens after a hand</h3>
        <ol>
          <li>The completed hand and action history are saved.</li>
          <li>The server validates cards, streets, actions, pot values, and result consistency.</li>
          <li>A background analysis job is queued so you can keep practising.</li>
          <li>The solver output is turned into decision cards with strategy frequencies and context.</li>
          <li>Validated decisions receive tags so similar spots can be found later.</li>
        </ol>
      </section>

      <section className="panel info-card">
        <h3>How to read a decision</h3>
        <div className="methodology-grid">
          <div><strong>Strategy mix</strong><p>The preferred action can be mixed. A non-100% action is not automatically wrong.</p></div>
          <div><strong>Equity context</strong><p>Equity and pot odds provide context; the solver recommendation remains the strategic verdict.</p></div>
          <div><strong>Similar spots</strong><p>Tags match street, branch, situation, action, verdict, and board texture without exposing another player’s identity.</p></div>
        </div>
      </section>

      <div className="notice-box">
        <span className="label">Known limitation</span>
        <p>Not every browser-legal line maps to every solver tree. Unsupported lines are surfaced clearly rather than presented as a made-up answer.</p>
      </div>

      <Link className="back-link" to="/play">Back to the table</Link>
    </section>
  );
}
