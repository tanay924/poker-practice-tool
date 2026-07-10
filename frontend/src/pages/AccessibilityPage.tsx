export default function AccessibilityPage() {
  return (
    <section className="stack information-page">
      <div className="page-heading"><p className="eyebrow">Inclusive study</p><h2>Accessibility</h2><p className="page-subtitle">The critical practice loop is designed for keyboard, touch, and reduced visual load.</p></div>
      <section className="panel info-card"><h3>Current support</h3><ul><li>Semantic headings, labels, buttons, tables, status messages, and landmark navigation.</li><li>Keyboard shortcuts are available at the table and never override editable fields.</li><li>Card information uses text and suit symbols rather than colour alone.</li><li>Responsive layouts keep action controls usable on narrow screens.</li></ul></section>
      <section className="panel info-card"><h3>Report a barrier</h3><p>Use the Support page with the route, action you were trying to take, browser, and whether the issue affects keyboard, screen-reader, touch, or visual use.</p></section>
    </section>
  );
}
