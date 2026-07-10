export default function PrivacyPage() {
  return (
    <section className="stack information-page">
      <div className="page-heading"><p className="eyebrow">Data and storage</p><h2>Privacy and storage</h2><p className="page-subtitle">A plain-language inventory of what the trainer stores and why.</p></div>
      <section className="panel info-card"><h3>What is stored</h3><ul><li>Completed hands, action histories, and solver answer sheets for your account or guest session.</li><li>Derived decision facts and StudySpots used for your stats and review queue.</li><li>Account profile details needed for friends and sharing when you create them.</li><li>Operational records such as queue status and request IDs.</li></ul></section>
      <section className="panel info-card"><h3>Control</h3><p>Guest sessions are server-issued, expiring, and stored as a digest. Signed-in users can download a JSON export or delete local trainer data from Account settings.</p></section>
      <section className="panel info-card"><h3>What is not needed</h3><p>The trainer does not need poker-site credentials, payment credentials, access tokens in support requests, or real-money account information.</p></section>
    </section>
  );
}
