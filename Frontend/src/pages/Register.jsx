import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Register = () => {
  const navigate = useNavigate();
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8081';
      const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName, email, password }),
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('userEmail', data.email);
        localStorage.setItem('accountName', data.accountName);
        localStorage.setItem('userId', String(data.userId));
        navigate('/dashboard');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Registration failed. Email might already be in use.');
      }
    } catch (err) {
      setError('Failed to connect to the server. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 480px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <style>{`
        @media (max-width: 900px) {
          .auth-brand-panel { display: none !important; }
          .auth-form-panel { grid-column: 1 / -1 !important; }
        }
        .auth-sweep {
          position: absolute;
          height: 1px;
          opacity: 0;
          background: linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent);
          animation: authSweep 4s ease-in-out infinite;
        }
        .auth-sweep-v {
          position: absolute;
          width: 1px;
          opacity: 0;
          background: linear-gradient(180deg, transparent, rgba(16,185,129,0.35), transparent);
          animation: authSweepV 5s ease-in-out infinite;
        }
        @keyframes authSweep {
          0%   { opacity: 0; transform: translateX(-20px); }
          30%  { opacity: 0.6; }
          70%  { opacity: 0.6; }
          100% { opacity: 0; transform: translateX(20px); }
        }
        @keyframes authSweepV {
          0%   { opacity: 0; transform: translateY(-20px); }
          30%  { opacity: 0.5; }
          70%  { opacity: 0.5; }
          100% { opacity: 0; transform: translateY(20px); }
        }
        /* Form panel slide-in */
        .auth-form-panel {
          animation: formSlideIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes formSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* Staggered field animation */
        .auth-field {
          animation: fieldFadeUp 0.35s ease forwards;
          opacity: 0;
        }
        .auth-field:nth-child(1) { animation-delay: 0.15s; }
        .auth-field:nth-child(2) { animation-delay: 0.22s; }
        .auth-field:nth-child(3) { animation-delay: 0.29s; }
        .auth-field:nth-child(4) { animation-delay: 0.36s; }
        @keyframes fieldFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Input glow on focus */
        .nd-input:focus {
          border-color: var(--accent-border) !important;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.08), 0 0 12px rgba(16,185,129,0.06);
        }
        /* Brand headline */
        .auth-brand-panel h1 {
          animation: fadeIn 0.6s ease 0.1s both;
        }
        .auth-brand-panel p {
          animation: fadeIn 0.6s ease 0.25s both;
        }
      `}</style>

      {/* Brand panel — identical structure to Login for consistency */}
      <div className="auth-brand-panel" style={{ position: 'relative', background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 56px', overflow: 'hidden' }}>

        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

        <div className="auth-sweep" style={{ width: '60%', top: '28%', left: '-5%', animationDelay: '0s' }} />
        <div className="auth-sweep" style={{ width: '45%', top: '52%', left: '15%', animationDelay: '1.4s' }} />
        <div className="auth-sweep" style={{ width: '50%', top: '74%', left: '5%', animationDelay: '2.8s' }} />
        <div className="auth-sweep-v" style={{ height: '40%', left: '35%', top: '8%', animationDelay: '0.7s' }} />
        <div className="auth-sweep-v" style={{ height: '32%', left: '65%', top: '38%', animationDelay: '2.1s' }} />

        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)', bottom: -100, right: -100, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div className="nd-logo" style={{ marginBottom: 56 }}>
            <div className="nd-logo-mark"><span /><span /><span /><span /></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <h1 style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, marginBottom: 20, letterSpacing: '-0.03em' }}>
            Build your<br />
            <span style={{ color: 'var(--accent)' }}>cluster.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.7, maxWidth: 340, fontWeight: 300 }}>
            A dynamic AI cluster platform where multiple small language models generate answers, vote on each other's output, and evolve over time.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { color: 'var(--accent)', label: 'Models compete & collaborate' },
            { color: 'var(--accent)', label: 'Adaptive scoring & rotation' },
            { color: 'var(--accent)', label: 'Host your own AI ecosystem' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, boxShadow: `0 0 8px ${f.color}`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-panel" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '56px 52px' }}>
        <div style={{ maxWidth: 340, width: '100%', margin: '0 auto' }}>

          <div style={{ marginBottom: 32 }} className="auth-field">
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Create account</h2>
            <p style={{ fontSize: 13, color: 'var(--text-mid)' }}>Join Selective and start building your cluster.</p>
          </div>

          <form onSubmit={handleRegister}>
            {error && (
              <div className="auth-field" style={{ fontSize: 12, color: 'var(--red)', marginBottom: 16, fontFamily: 'var(--font-mono)', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                {error}
              </div>
            )}

            <div className="auth-field" style={{ marginBottom: 16 }}>
              <label className="label-caps" style={{ display: 'block', marginBottom: 7 }}>Account Name</label>
              <input className="nd-input" type="text" placeholder="your_handle" value={accountName} onChange={e => setAccountName(e.target.value)} required />
            </div>

            <div className="auth-field" style={{ marginBottom: 16 }}>
              <label className="label-caps" style={{ display: 'block', marginBottom: 7 }}>Email Address</label>
              <input className="nd-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="auth-field" style={{ marginBottom: 24 }}>
              <label className="label-caps" style={{ display: 'block', marginBottom: 7 }}>Password</label>
              <input className="nd-input" type="password" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required />
              <div style={{ fontSize: 10, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>Must be at least 8 characters</div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 13 }} disabled={isLoading}>
              {isLoading ? <><span className="spin">⟳</span> Creating account…</> : 'Create Account'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div className="nd-divider" style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)' }}>already a member?</span>
            <div className="nd-divider" style={{ flex: 1 }} />
          </div>

          <button type="button" onClick={() => navigate('/login')} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: 13, cursor: 'pointer', textAlign: 'center' }}>
            Sign in to your account <span style={{ color: 'var(--accent)' }}>→</span>
          </button>

          <button className="nd-back-btn" onClick={() => navigate('/')} style={{ marginTop: 28 }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;