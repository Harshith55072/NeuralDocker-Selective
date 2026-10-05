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
          Academic &amp; Research License
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 32 }}>
          Last updated: June 2026 &middot; NeuralDocker Selective
        </p>

        <p style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.85, marginBottom: 16 }}>
          Copyright &copy; 2026 NeuralDocker Selective and its contributors. All rights reserved.
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.85 }}>
          This license governs use of the NeuralDocker Selective software (the &ldquo;Project&rdquo;),
          including its source code, documentation, and associated assets, unless a different
          license is explicitly granted in writing by the authors.
        </p>

        <div style={{ height: 1, background: 'var(--border)', margin: '48px 0' }}/>

        <Section title="1. Purpose &amp; Scope">
          This Project is developed and distributed for
          <strong style={{ color: 'var(--text)' }}> academic, educational, and research purposes only</strong>.
          It is not a commercial product, and the authors and contributors make no
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
          Unless explicitly licensed otherwise in writing by the authors, you may{' '}
          <strong style={{ color: 'var(--text)' }}>not</strong>:
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            <li>Deploy this software as part of a commercial product or paid service</li>
            <li>Resell, sublicense, or relicense the software or derivative works</li>
            <li>Remove or alter attribution to the original authors</li>
            <li>Represent benchmark results as independently verified production guarantees</li>
          </ul>
        </Section>

        <Section title="4. No Warranty">
          <p style={{ margin: 0 }}>
            This software is provided <strong style={{ color: 'var(--text)' }}>&ldquo;as is&rdquo;</strong>,
            without warranty of any kind, express or implied, including but not limited to the
            warranties of merchantability, fitness for a particular purpose, and non-infringement.
            In no event shall the authors be liable for any claim, damages, or other liability
            arising from the use of this software.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            Benchmark figures published alongside this Project reflect a single evaluation
            session under the conditions described in the Project&apos;s published report, and may
            not generalize to all hardware, model, or workload configurations.
          </p>
        </Section>

        <Section title="5. Data &amp; Privacy">
          Selective is designed to run entirely on local hardware. No inference data, prompts,
          or model outputs are transmitted to any external server by the core software.
          Account data created when registering for the dashboard is used solely to manage
          your own cluster sessions and is not shared externally.
        </Section>

        <Section title="6. Attribution">
          If you use Selective or its benchmark methodology in published academic work, please
          cite the project repository.
        </Section>

        <Section title="7. Contact">
          For licensing questions outside the scope of academic use &mdash; including commercial
          licensing &mdash; please open an issue on the Project&apos;s GitHub repository.
        </Section>

        <div style={{ height: 1, background: 'var(--border)', margin: '48px 0 32px' }}/>

        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          The LICENSE.md file in the project repository is the authoritative license text for
          NeuralDocker Selective. This page mirrors it for convenience and is not a substitute for it.
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
