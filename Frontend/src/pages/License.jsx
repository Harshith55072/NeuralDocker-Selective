import React from 'react';
import { useNavigate } from 'react-router-dom';

const License = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 56,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{
            width: 26, height: 26, background: 'var(--text)', borderRadius: 6,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '5px',
          }}>
            <span style={{ background: '#000', borderRadius: 1 }}/>
            <span style={{ background: '#000', borderRadius: 1 }}/>
            <span style={{ background: '#000', borderRadius: 1 }}/>
            <span style={{ background: '#000', borderRadius: 1, opacity: 0.35 }}/>
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>NeuralDocker</div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Selective</div>
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: '1px solid var(--border-mid)', color: 'var(--text-mid)',
            padding: '7px 16px', borderRadius: 99, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          &larr; Back home
        </button>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 24px 120px' }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>
          Legal
        </div>
        <h1 style={{ fontSize: 'clamp(32px,4vw,46px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 12 }}>
          Terms &amp; Academic License
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 48 }}>
          Last updated: June 2026 &middot; NeuralDocker / Selective
        </p>

        <div style={{ height: 1, background: 'var(--border)', marginBottom: 48 }}/>

        <Section title="1. Purpose &amp; Scope">
          Selective (this software, "the Project") is developed and distributed for
          <strong style={{ color: 'var(--text)' }}> academic, educational, and research purposes only</strong>.
          It is not a commercial product, and NeuralDocker, and its contributors make no
          warranties regarding its fitness for production or commercial deployment.
        </Section>

        <Section title="2. Permitted Use">
          You may use, study, modify, and redistribute this software for:
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            <li>Academic coursework, theses, and research projects</li>
            <li>Personal learning and experimentation</li>
            <li>Non-commercial open-source contributions back to the Project</li>
          </ul>
        </Section>

        <Section title="3. Restrictions">
          Unless explicitly licensed otherwise in writing, you may{' '}
          <strong style={{ color: 'var(--text)' }}>not</strong>:
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            <li>Deploy this software as part of a commercial product or paid service</li>
            <li>Resell, sublicense, or relicense the software or derivative works</li>
            <li>Remove or alter attribution to the original authors</li>
            <li>Represent benchmark results as independently verified production guarantees</li>
          </ul>
        </Section>

        <Section title="4. No Warranty">
          This software is provided "as is," without warranty of any kind, express or implied,
          including but not limited to warranties of merchantability, fitness for a particular
          purpose, and non-infringement. Benchmark figures published on this site reflect a
          single evaluation session under the conditions described in the project's published
          report and may not generalise to all hardware, model, or workload configurations.
        </Section>

        <Section title="5. Data &amp; Privacy">
          Selective is designed to run entirely on local hardware. No inference data, prompts,
          or model outputs are transmitted to any external server by the core software.
          Account data created when registering for this dashboard is used solely to manage
          your cluster sessions.
        </Section>

        <Section title="6. Attribution">
          If you use Selective or its benchmark methodology in published academic work, please
          cite the project repository. See the GitHub link in the footer for citation details.
        </Section>

        <Section title="7. Contact">
          For licensing questions outside the scope of academic use, please open an issue on
          the project's GitHub repository.
        </Section>

        <div style={{ height: 1, background: 'var(--border)', margin: '48px 0 32px' }}/>

        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          This page is a placeholder summary and does not constitute formal legal advice.
          Consult the LICENSE file in the project repository for the authoritative license text.
        </p>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</h2>
    <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.85 }}>{children}</div>
  </div>
);

export default License;