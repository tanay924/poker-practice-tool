export default function TermsPage() {
  return (
    <section className="stack information-page">
      <div className="page-heading"><p className="eyebrow">Product scope</p><h2>Terms and scope</h2><p className="page-subtitle">The operating boundaries of this study tool.</p></div>
      <section className="panel info-card"><h3>Study use only</h3><p>This is a heads-up no-limit hold'em practice environment. It is not a real-money service, does not connect to poker sites, and does not automate play.</p></section>
      <section className="panel info-card"><h3>Solver limitations</h3><p>Only supported 100bb SB-versus-BB branches are analysed. Unsupported lines are labelled instead of being presented as invented advice.</p></section>
      <section className="panel info-card"><h3>Respectful use</h3><p>Do not submit private information belonging to someone else, attempt to overwhelm the local or hosted solver, or use social features to harass another user. Blocking and reporting are available when social is enabled.</p></section>
    </section>
  );
}
