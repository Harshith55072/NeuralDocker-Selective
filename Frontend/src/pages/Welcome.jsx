import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const GITHUB_PRODUCT  = 'https://github.com/Harshith55072/NeuralDocker-Selective.git';
const GITHUB_DATA     = 'https://github.com/Harshith55072/DataSheet-s_Of_Projects.git';

// ─── Neural cluster canvas ────────────────────────────────────────────────────
const NeuralCanvas = () => {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const makeNodes = () => {
      const cx = W() * 0.5, cy = H() * 0.5;
      const nodes = [];
      nodes.push({ id:0, x:cx, y:cy, r:11, role:'host', label:'HOST',
        vx:0, vy:0, baseX:cx, baseY:cy, pulse:0, pulseDir:1, score:100 });
      const r1 = Math.min(W(),H()) * 0.21;
      for (let i=0;i<3;i++) {
        const a = (i/3)*Math.PI*2 - Math.PI/2;
        nodes.push({ id:nodes.length, x:cx+Math.cos(a)*r1, y:cy+Math.sin(a)*r1,
          r:7, role:'worker', label:`M${i+1}`, score:Math.round(60+Math.random()*40),
          vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3,
          baseX:cx+Math.cos(a)*r1, baseY:cy+Math.sin(a)*r1,
          pulse:Math.random()*Math.PI*2, pulseDir:Math.random()>0.5?1:-1 });
      }
      const r2 = Math.min(W(),H()) * 0.39;
      for (let i=0;i<5;i++) {
        const a = (i/5)*Math.PI*2 + Math.PI/10;
        nodes.push({ id:nodes.length, x:cx+Math.cos(a)*r2, y:cy+Math.sin(a)*r2,
          r:6, role:'worker', label:`M${i+4}`, score:Math.round(30+Math.random()*70),
          vx:(Math.random()-0.5)*0.25, vy:(Math.random()-0.5)*0.25,
          baseX:cx+Math.cos(a)*r2, baseY:cy+Math.sin(a)*r2,
          pulse:Math.random()*Math.PI*2, pulseDir:Math.random()>0.5?1:-1 });
      }
      return nodes;
    };

    const makePackets = (nodes) => Array.from({length:14}, () => {
      const fi = Math.floor(Math.random()*nodes.length);
      let ti = Math.floor(Math.random()*nodes.length);
      while (ti===fi) ti = Math.floor(Math.random()*nodes.length);
      return { from:fi, to:ti, t:Math.random(), speed:0.003+Math.random()*0.004,
        color:Math.random()>0.4?'#10b981':'#34d399', size:2+Math.random()*1.5 };
    });

    let nodes = makeNodes();
    let packets = makePackets(nodes);
    let vote = { active:false, timer:0, duration:60, from:null, to:null, score:0 };
    let voteCD = 100 + Math.random()*160;
    let scanY = 0;

    const drawEdge = (a, b, alpha=0.07) => {
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=`rgba(16,185,129,${alpha})`; ctx.lineWidth=1; ctx.stroke();
    };

    const drawNode = (n, t) => {
      const pulse = 0.5 + 0.5*Math.sin(n.pulse + t*0.04*n.pulseDir);
      const g = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*4);
      g.addColorStop(0,`rgba(16,185,129,${0.09*pulse})`); g.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(n.x,n.y,n.r*4,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      if (n.role==='host') {
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r+5+pulse*3,0,Math.PI*2);
        ctx.strokeStyle=`rgba(16,185,129,${0.22*pulse})`; ctx.lineWidth=1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r+12+pulse*2,0,Math.PI*2);
        ctx.strokeStyle=`rgba(16,185,129,${0.07*pulse})`; ctx.lineWidth=1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
      if (n.role==='host') {
        const f=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
        f.addColorStop(0,'#34d399'); f.addColorStop(1,'#10b981'); ctx.fillStyle=f;
      } else {
        ctx.fillStyle=`rgba(16,185,129,${0.2+0.12*pulse})`;
      }
      ctx.fill();
      ctx.strokeStyle=`rgba(16,185,129,${0.45+0.3*pulse})`; ctx.lineWidth=1.2; ctx.stroke();
      ctx.font=`500 ${n.role==='host'?9:8}px JetBrains Mono,monospace`;
      ctx.fillStyle=n.role==='host'?'#000':`rgba(16,185,129,${0.65+0.3*pulse})`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(n.label,n.x,n.y);
      if (n.role==='worker') {
        ctx.font='500 7px JetBrains Mono,monospace';
        ctx.fillStyle=`rgba(16,185,129,${0.4+0.2*pulse})`;
        ctx.fillText(`${n.score}pts`,n.x,n.y-n.r-7);
      }
    };

    const drawPacket = (pkt) => {
      const a=nodes[pkt.from], b=nodes[pkt.to]; if (!a||!b) return;
      const x=a.x+(b.x-a.x)*pkt.t, y=a.y+(b.y-a.y)*pkt.t;
      const g=ctx.createRadialGradient(x,y,0,x,y,pkt.size*3);
      g.addColorStop(0,pkt.color); g.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(x,y,pkt.size*3,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.beginPath(); ctx.arc(x,y,pkt.size,0,Math.PI*2); ctx.fillStyle=pkt.color; ctx.fill();
    };

    let t=0;
    const tick = () => {
      t++;
      const w=W(), h=H(), cx=w*0.5, cy=h*0.5;
      ctx.clearRect(0,0,w,h);
      const vg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)*0.65);
      vg.addColorStop(0,'rgba(16,185,129,0.04)'); vg.addColorStop(1,'transparent');
      ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);
      scanY=(scanY+0.7)%(h+40);
      const sg=ctx.createLinearGradient(0,scanY-20,0,scanY+20);
      sg.addColorStop(0,'transparent'); sg.addColorStop(0.5,'rgba(16,185,129,0.025)'); sg.addColorStop(1,'transparent');
      ctx.fillStyle=sg; ctx.fillRect(0,scanY-20,w,40);
      nodes.forEach(n => {
        if (n.role==='host') return;
        n.x+=n.vx; n.y+=n.vy;
        n.vx+=(n.baseX-n.x)*0.004; n.vy+=(n.baseY-n.y)*0.004;
        n.vx*=0.96; n.vy*=0.96; n.pulse+=0.03;
      });
      nodes[0].pulse+=0.025; nodes[0].x=cx; nodes[0].y=cy;
      nodes.slice(1).forEach(n=>drawEdge(nodes[0],n));
      const r1=nodes.slice(1,4); r1.forEach((n,i)=>drawEdge(n,r1[(i+1)%r1.length],0.05));
      const r2=nodes.slice(4); r2.forEach((n,i)=>drawEdge(n,r2[(i+1)%r2.length],0.04));
      packets.forEach(pkt => {
        pkt.t+=pkt.speed;
        if (pkt.t>=1) {
          pkt.t=0; pkt.from=Math.floor(Math.random()*nodes.length);
          pkt.to=Math.floor(Math.random()*nodes.length);
          while(pkt.to===pkt.from) pkt.to=Math.floor(Math.random()*nodes.length);
        }
        drawPacket(pkt);
      });
      nodes.forEach(n=>drawNode(n,t));
      voteCD--;
      if (voteCD<=0) {
        vote.active=true; vote.timer=0;
        vote.from=nodes[1+Math.floor(Math.random()*(nodes.length-1))];
        vote.to=nodes[1+Math.floor(Math.random()*(nodes.length-1))];
        vote.score=Math.floor(Math.random()*5)+1;
        voteCD=80+Math.random()*140;
        if (vote.to) vote.to.score=Math.min(100,(vote.to.score||50)+vote.score);
      }
      if (vote.active) {
        vote.timer++;
        if (vote.from&&vote.to) {
          const prog=vote.timer/vote.duration;
          const alpha=prog<0.3?prog/0.3:prog>0.7?(1-prog)/0.3:1;
          const mx=(vote.from.x+vote.to.x)/2, my=(vote.from.y+vote.to.y)/2-18;
          ctx.font='bold 11px JetBrains Mono,monospace';
          ctx.fillStyle=`rgba(52,211,153,${alpha})`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(`+${vote.score}`,mx,my);
        }
        if (vote.timer>=vote.duration) vote.active=false;
      }
      animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize',resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />;
};

// ─── Intersection observer hook ───────────────────────────────────────────────
const useInView = (threshold=0.15) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
};

// ─── Animated counter ─────────────────────────────────────────────────────────
const Counter = ({ to, suffix='', decimals=0, duration=1400 }) => {
  const [val, setVal] = useState(0);
  const [ref, inView] = useInView(0.3);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now-start)/duration, 1);
      const ease = 1 - Math.pow(1-p, 3);
      setVal(+(to * ease).toFixed(decimals));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration, decimals]);
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
};

// ─── Benchmark bar ────────────────────────────────────────────────────────────
const BenchBar = ({ label, pct, highlight, delay=0 }) => {
  const [ref, inView] = useInView(0.1);
  return (
    <div ref={ref} style={{ display:'flex', alignItems:'center', gap:14, opacity: inView?1:0,
      transform: inView?'translateX(0)':'translateX(-20px)',
      transition:`opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms` }}>
      <div style={{ width:160, fontSize:11, fontFamily:'var(--font-mono)',
        color: highlight ? '#10b981' : 'rgba(255,255,255,0.6)', flexShrink:0,
        fontWeight: highlight ? 600 : 400 }}>
        {label}
      </div>
      <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden' }}>
        <div style={{
          height:'100%', borderRadius:2,
          background: highlight ? 'linear-gradient(90deg, #10b981, #34d399)' : 'rgba(255,255,255,0.22)',
          width: inView ? `${pct}%` : '0%',
          transition: `width 1s cubic-bezier(0.16,1,0.3,1) ${delay+200}ms`,
          boxShadow: highlight ? '0 0 12px rgba(16,185,129,0.5)' : 'none',
        }}/>
      </div>
      <div style={{ width:48, fontSize:12, fontFamily:'var(--font-mono)', textAlign:'right',
        color: highlight ? '#10b981' : 'rgba(255,255,255,0.55)',
        fontWeight: highlight ? 700 : 400 }}>
        {pct}%
      </div>
    </div>
  );
};

// ─── Fade-in wrapper ──────────────────────────────────────────────────────────
const Fade = ({ children, delay=0, style={} }) => {
  const [ref, inView] = useInView(0.1);
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'none' : 'translateY(28px)',
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
};

// ─── Welcome ──────────────────────────────────────────────────────────────────
const Welcome = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const check = () => setIsLoggedIn(!!localStorage.getItem('token'));
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => {
    ['token','userEmail','accountName','userId'].forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    navigate('/');
  };

  return (
    <div style={{ background:'#000', color:'#f2f2f2', fontFamily:'var(--font-sans)', overflowX:'hidden' }}>
      <style>{`
        @keyframes wl-fadeup {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes wl-glow-pulse {
          0%,100% { opacity:0.07; transform:scale(1); }
          50%     { opacity:0.15; transform:scale(1.1); }
        }
        @keyframes wl-badge {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes wl-dot {
          0%,100% { opacity:1; box-shadow:0 0 6px #10b981; }
          50%     { opacity:0.4; box-shadow:0 0 2px #10b981; }
        }
        @keyframes wl-scroll-hint {
          0%,100% { transform:translateY(0) translateX(-50%); opacity:0.5; }
          50%     { transform:translateY(5px) translateX(-50%); opacity:0.25; }
        }

        .wl-a1 { animation: wl-badge  0.5s ease 0.05s both; }
        .wl-a2 { animation: wl-fadeup 0.9s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
        .wl-a3 { animation: wl-fadeup 0.8s cubic-bezier(0.16,1,0.3,1) 0.32s both; }
        .wl-a4 { animation: wl-fadeup 0.7s ease 0.48s both; }
        .wl-a5 { animation: wl-fadeup 0.6s ease 0.6s both; }
        .wl-a6 { animation: wl-fadeup 0.6s ease 0.72s both; }
        .wl-orb { animation: wl-glow-pulse 5s ease-in-out infinite; }
        .wl-live-dot { animation: wl-dot 2.5s ease-in-out infinite; }
        .wl-scroll-hint { animation: wl-scroll-hint 2s ease-in-out infinite; }

        /* Nav buttons — visible even on black bg */
        .wl-nav-btn {
          background:none;
          border:1px solid rgba(255,255,255,0.14);
          color:rgba(255,255,255,0.65);
          padding:7px 16px;
          border-radius:8px; font-size:12px; font-weight:500;
          cursor:pointer; transition:all 140ms ease; font-family:var(--font-sans);
        }
        .wl-nav-btn:hover { border-color:rgba(255,255,255,0.28); color:#f2f2f2; background:rgba(255,255,255,0.04); }
        .wl-nav-btn.primary { background:#10b981; color:#000; border-color:#10b981; font-weight:700; }
        .wl-nav-btn.primary:hover { opacity:0.88; }

        .wl-cta-main {
          display:inline-flex; align-items:center; gap:8px;
          background:#f2f2f2; color:#000;
          padding:13px 26px; border-radius:10px;
          font-size:13px; font-weight:700; cursor:pointer;
          border:none; font-family:var(--font-sans);
          transition:opacity 140ms ease, transform 140ms ease;
        }
        .wl-cta-main:hover { opacity:0.9; transform:translateY(-1px); }

        .wl-cta-ghost {
          display:inline-flex; align-items:center; gap:8px;
          background:none; color:rgba(255,255,255,0.65);
          padding:13px 26px; border-radius:10px;
          font-size:13px; font-weight:500; cursor:pointer;
          border:1px solid rgba(255,255,255,0.16); font-family:var(--font-sans);
          text-decoration:none; transition:all 140ms ease;
        }
        .wl-cta-ghost:hover { border-color:rgba(255,255,255,0.32); color:#f2f2f2; transform:translateY(-1px); }

        .wl-cta-accent {
          display:inline-flex; align-items:center; gap:8px;
          background:rgba(16,185,129,0.1); color:#10b981;
          padding:13px 26px; border-radius:10px;
          font-size:13px; font-weight:600; cursor:pointer;
          border:1px solid rgba(16,185,129,0.28); font-family:var(--font-sans);
          text-decoration:none; transition:all 140ms ease;
        }
        .wl-cta-accent:hover { background:rgba(16,185,129,0.16); border-color:rgba(16,185,129,0.45); transform:translateY(-1px); }

        /* Section labels — bright enough to read */
        .wl-section-label {
          font-size:9px; font-family:var(--font-mono);
          text-transform:uppercase; letter-spacing:0.18em;
          color:rgba(16,185,129,0.75);
        }

        /* Step cards — no numbered markers, just clean hover */
        .wl-step-card {
          padding:28px 24px 24px;
          border:1px solid rgba(255,255,255,0.08);
          border-radius:16px;
          background:rgba(255,255,255,0.025);
          transition:border-color 0.2s ease, background 0.2s ease;
        }
        .wl-step-card:hover {
          border-color:rgba(16,185,129,0.25);
          background:rgba(16,185,129,0.035);
        }

        .wl-nav-scrolled {
          background:rgba(0,0,0,0.88) !important;
          backdrop-filter:blur(16px);
          border-bottom-color:rgba(255,255,255,0.08) !important;
        }

        /* Footer links */
        .wl-footer-link {
          font-size:11px; color:rgba(255,255,255,0.42);
          text-decoration:none; font-family:var(--font-mono);
          transition:color 0.15s ease; cursor:pointer;
        }
        .wl-footer-link:hover { color:rgba(255,255,255,0.75); }

        @media (prefers-reduced-motion: reduce) {
          .wl-a1,.wl-a2,.wl-a3,.wl-a4,.wl-a5,.wl-a6 { animation:none !important; opacity:1; transform:none; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className={scrollY > 20 ? 'wl-nav-scrolled' : ''} style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 48px', height:56,
        borderBottom:'1px solid transparent',
        transition:'background 0.3s ease, border-color 0.3s ease',
      }}>
        <div className="nd-logo">
          <div className="nd-logo-mark"><span/><span/><span/><span/></div>
          <div className="nd-logo-text">
            <span className="nd-logo-sub">NeuralDocker</span>
            <span className="nd-logo-name">Selective</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <a href={GITHUB_DATA} target="_blank" rel="noreferrer" className="wl-nav-btn" style={{ textDecoration:'none' }}>Data</a>
          <a href={GITHUB_PRODUCT} target="_blank" rel="noreferrer" className="wl-nav-btn" style={{ textDecoration:'none' }}>GitHub</a>
          {isLoggedIn ? (
            <>
              <button className="wl-nav-btn" onClick={handleLogout}>Sign Out</button>
              <button className="wl-nav-btn primary" onClick={() => navigate('/dashboard')}>Dashboard</button>
            </>
          ) : (
            <>
              <button className="wl-nav-btn" onClick={() => navigate('/login')}>Sign In</button>
              <button className="wl-nav-btn primary" onClick={() => navigate('/register')}>Get Started</button>
            </>
          )}
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section style={{
        position:'relative', minHeight:'100vh',
        display:'flex', alignItems:'center',
        overflow:'hidden', paddingTop:56,
      }}>
        <div className="wl-orb" style={{
          position:'absolute', width:900, height:900, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)',
          top:'50%', left:'-12%', transform:'translateY(-50%)', pointerEvents:'none',
        }}/>
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
          backgroundSize:'80px 80px',
          maskImage:'radial-gradient(ellipse 65% 80% at 12% 50%, black 0%, transparent 100%)',
          WebkitMaskImage:'radial-gradient(ellipse 65% 80% at 12% 50%, black 0%, transparent 100%)',
        }}/>

        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr',
          width:'100%', maxWidth:1400, margin:'0 auto',
          padding:'0 48px', alignItems:'center', gap:48, position:'relative', zIndex:2,
        }}>
          {/* Left */}
          <div>
            <div className="wl-a1" style={{ marginBottom:24 }}>
              <span style={{
                fontSize:10, fontFamily:'var(--font-mono)', letterSpacing:'0.16em',
                textTransform:'uppercase', color:'rgba(255,255,255,0.65)',
                display:'inline-flex', alignItems:'center', gap:7,
              }}>
                <span style={{
                  width:5, height:5, borderRadius:'50%', background:'#10b981',
                  boxShadow:'0 0 6px rgba(16,185,129,0.8)', display:'inline-block', flexShrink:0,
                }}/>
                NeuralDocker · Self-hosted · Local AI
              </span>
            </div>

            <div className="wl-a2">
              <div style={{
                fontSize:'clamp(68px, 9.5vw, 116px)',
                fontWeight:800, letterSpacing:'-0.03em', lineHeight:0.88, marginBottom:22,
              }}>
                Selective
              </div>
              <div style={{
                fontSize:'clamp(13px, .6vw, 17px)', fontWeight:400,
                color:'rgba(255,255,255,0.55)', letterSpacing:'0.06em',
                fontFamily:'var(--font-mono)', marginBottom:32,
              }}>
                Distributed consensus engine
              </div>
            </div>

            <p className="wl-a3" style={{
              fontSize:16, color:'#c4c4c4', lineHeight:1.78,
              maxWidth:460, fontWeight:300, marginBottom:12,
            }}>
              Multiple local AI models compete, vote blind on each other's answers, and the best response wins — automatically, every time.
            </p>
            <p className="wl-a4" style={{
              fontSize:12, fontFamily:'var(--font-mono)',
              color:'rgba(255,255,255,0.5)', marginBottom:42, lineHeight:1.7,
            }}>
              No cloud. No API keys. Your hardware, your cluster, your data.
            </p>

            <div className="wl-a5" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              {isLoggedIn ? (
                <button className="wl-cta-main" onClick={() => navigate('/dashboard')}>
                  Go to Dashboard
                  <svg fill="none" stroke="currentColor" viewBox="0 0 16 16" style={{ width:14,height:14 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 3l5 5-5 5"/>
                  </svg>
                </button>
              ) : (
                <>
                  <button className="wl-cta-main" onClick={() => navigate('/register')}>
                    Get Started
                    <svg fill="none" stroke="currentColor" viewBox="0 0 16 16" style={{ width:14,height:14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 3l5 5-5 5"/>
                    </svg>
                  </button>
                  <button className="wl-cta-ghost" onClick={() => navigate('/login')}>Sign In</button>
                </>
              )}
              <a href={GITHUB_PRODUCT} target="_blank" rel="noreferrer" className="wl-cta-ghost">
                <svg viewBox="0 0 16 16" fill="currentColor" style={{ width:13,height:13 }}>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                Download
              </a>
            </div>

            {/* Hero stats row — brighter separators and values */}
            <div className="wl-a6" style={{
              marginTop:46, display:'flex', alignItems:'center', gap:20,
              fontSize:11, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.4)',
            }}>
              <span style={{ color:'#10b981', fontWeight:600 }}>93.33%</span>
              <span style={{ color:'rgba(255,255,255,0.55)' }}>ensemble accuracy</span>
              <span style={{ width:1, height:12, background:'rgba(255,255,255,0.15)', flexShrink:0 }}/>
              <span style={{ color:'#10b981', fontWeight:600 }}>+9pp</span>
              <span style={{ color:'rgba(255,255,255,0.55)' }}>reasoning gain</span>
              <span style={{ width:1, height:12, background:'rgba(255,255,255,0.15)', flexShrink:0 }}/>
              <span style={{ color:'rgba(255,255,255,0.45)' }}>300 questions · 4 models</span>
            </div>
          </div>

          {/* Right — canvas */}
          <div style={{
            height:'min(72vh, 640px)', position:'relative',
            transform:`translateY(${-scrollY * 0.32}px)`,
          }}>
            <div style={{
              position:'absolute', inset:0,
              border:'1px solid rgba(16,185,129,0.12)', borderRadius:24,
              background:'rgba(16,185,129,0.015)', overflow:'hidden',
            }}>
              <NeuralCanvas/>
              <div style={{
                position:'absolute', inset:0,
                background:'radial-gradient(ellipse 65% 35% at 50% 100%, rgba(0,0,0,0.65) 0%, transparent 60%)',
                pointerEvents:'none',
              }}/>
              {/* Canvas labels — brighter so they're actually readable */}
              <div style={{ position:'absolute', top:16, left:20, fontSize:9,
                fontFamily:'var(--font-mono)', color:'rgba(16,185,129,0.5)',
                letterSpacing:'0.14em', textTransform:'uppercase' }}>Cluster Topology</div>
              <div style={{ position:'absolute', bottom:16, right:20, fontSize:8,
                fontFamily:'var(--font-mono)', color:'rgba(16,185,129,0.3)' }}>ND/SELECTIVE</div>
            </div>
          </div>
        </div>

        {/* Scroll hint — more visible */}
        <div className="wl-scroll-hint" style={{
          position:'absolute', bottom:28, left:'50%',
          display:'flex', flexDirection:'column', alignItems:'center', gap:6,
          opacity: scrollY > 50 ? 0 : 1, transition:'opacity 0.4s ease', pointerEvents:'none',
        }}>
          <span style={{ fontSize:9, fontFamily:'var(--font-mono)', letterSpacing:'0.14em',
            textTransform:'uppercase', color:'rgba(255,255,255,0.45)' }}>Scroll</span>
          <svg fill="none" stroke="rgba(255,255,255,0.45)" viewBox="0 0 12 18" style={{ width:12 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 1v12M2 9l4 5 4-5"/>
          </svg>
        </div>
      </section>

      {/* ══ STAT BAR ══ */}
      <section style={{
        borderTop:'1px solid rgba(255,255,255,0.07)',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        padding:'36px 0',
        background:'rgba(255,255,255,0.015)',
      }}>
        <div style={{
          maxWidth:1400, margin:'0 auto', padding:'0 48px',
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
        }}>
          {[
            { val:93.33, suffix:'%', dec:2, label:'Ensemble accuracy',  sub:'across 300 questions' },
            { val:9,     suffix:'pp',dec:0, label:'Reasoning lift',      sub:'vs best individual model' },
            { val:33.3,  suffix:'%', dec:1, label:'Fewer errors',        sub:'ensemble vs best single' },
            { val:4,     suffix:'',  dec:0, label:'Models competing',    sub:'voting blind, simultaneously' },
          ].map((s, i) => (
            <Fade key={s.label} delay={i*70}
              style={{ padding:'0 36px', borderRight: i<3 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
              <div style={{ fontSize:'clamp(26px,3.5vw,42px)', fontWeight:700,
                fontFamily:'var(--font-mono)', color:'#10b981',
                letterSpacing:'-0.03em', lineHeight:1 }}>
                <Counter to={s.val} suffix={s.suffix} decimals={s.dec}/>
              </div>
              {/* Label — was 0.58, now readable */}
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.72)', marginTop:7, fontWeight:500 }}>{s.label}</div>
              {/* Sub — was 0.22, now readable */}
              <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.4)', marginTop:3 }}>{s.sub}</div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section style={{ padding:'120px 48px', maxWidth:1400, margin:'0 auto' }}>
        <Fade>
          <span className="wl-section-label">How it works</span>
          <div style={{ width:36, height:1, background:'linear-gradient(90deg,#10b981,transparent)', margin:'14px 0 40px' }}/>
          <h2 style={{ fontSize:'clamp(26px,3.8vw,40px)', fontWeight:700,
            letterSpacing:'-0.03em', maxWidth:480, lineHeight:1.18, marginBottom:64 }}>
            Models compete.<br/>
            <span style={{ color:'rgba(255,255,255,0.32)' }}>The cluster decides.</span>
          </h2>
        </Fade>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
          {[
            { title:'Independent answers',
              body:"All models receive the same question simultaneously. None can see each other's response.",
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width:20,height:20 }}>
                <circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/>
                <path d="M6 9V5M18 9V5M6 15v4M18 15v4" strokeLinecap="round"/>
              </svg> },
            { title:'Blind peer voting',
              body:"Each model scores every other answer 1–5. No model knows whose answer it's judging.",
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width:20,height:20 }}>
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="9"/>
              </svg> },
            { title:'Weighted influence',
              body:'Models with stronger track records carry more voting weight. Better models earn louder votes.',
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width:20,height:20 }}>
                <path d="M3 17l5-5 4 4 9-10" strokeLinecap="round" strokeLinejoin="round"/>
              </svg> },
            { title:'Best answer wins',
              body:'Highest-consensus response is returned. Weakest model rotates out at session end.',
              icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ width:20,height:20 }}>
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" strokeLinejoin="round"/>
              </svg> },
          ].map((step, i) => (
            <Fade key={step.title} delay={i*80}>
              <div className="wl-step-card">
                <div style={{ width:38, height:38, borderRadius:9, marginBottom:18,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.22)',
                  color:'#10b981' }}>
                  {step.icon}
                </div>
                {/* Title — was 0.82, now full white */}
                <div style={{ fontSize:14, fontWeight:600, marginBottom:10,
                  color:'rgba(255,255,255,0.92)', lineHeight:1.3 }}>{step.title}</div>
                {/* Body — was 0.36, now 0.62 — readable */}
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.62)', lineHeight:1.7 }}>{step.body}</div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ══ BENCHMARK ══ */}
      <section style={{
        padding:'120px 48px',
        background:'rgba(255,255,255,0.012)',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth:1400, margin:'0 auto' }}>
          <Fade>
            <span className="wl-section-label">Benchmark · June 2026 · 300 questions</span>
            <div style={{ width:36, height:1, background:'linear-gradient(90deg,#10b981,transparent)', margin:'14px 0 0' }}/>
          </Fade>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'start', marginTop:48 }}>
            <Fade delay={100}>
              <h2 style={{ fontSize:'clamp(24px,3.4vw,36px)', fontWeight:700,
                letterSpacing:'-0.03em', lineHeight:1.2, marginBottom:20 }}>
                Real numbers.<br/>
                <span style={{ color:'rgba(255,255,255,0.32)' }}>Not a demo.</span>
              </h2>
              {/* Body copy — was 0.42, now 0.62 */}
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.62)', lineHeight:1.82,
                marginBottom:24, maxWidth:400 }}>
                Four Q4_K_M quantised models were benchmarked individually across 300 questions — factual, reasoning, and coding — then combined via weighted ensemble.
              </p>
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.62)', lineHeight:1.82,
                maxWidth:400, marginBottom:36 }}>
                The ensemble outperformed every individual model. The largest gain was in Reasoning: <span style={{ color:'#10b981' }}>+9 percentage points</span> over the best single model — the hardest category where weak models added the most noise.
              </p>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <a href={GITHUB_DATA} target="_blank" rel="noreferrer" className="wl-cta-accent">
                  <svg viewBox="0 0 16 16" fill="currentColor" style={{ width:13,height:13 }}>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                  </svg>
                  View Full Data
                </a>
                <a href={GITHUB_PRODUCT} target="_blank" rel="noreferrer" className="wl-cta-ghost">
                  Download Selective
                </a>
              </div>
            </Fade>

            <Fade delay={180}>
              <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
                <div>
                  {/* Sub-section label — was 0.22, now 0.4 */}
                  <div style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.4)',
                    letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Overall Accuracy</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <BenchBar label="Ensemble"             pct={93.33} highlight delay={0}/>
                    <BenchBar label="qwen2.5-1.5b"         pct={90.00} delay={70}/>
                    <BenchBar label="Llama-3.2-1B"         pct={83.67} delay={140}/>
                    <BenchBar label="unsloth (finetuned)"  pct={58.33} delay={210}/>
                    <BenchBar label="gemma-2b"             pct={38.00} delay={280}/>
                  </div>
                </div>
                <div style={{ paddingTop:24, borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.4)',
                    letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Reasoning Only</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <BenchBar label="Ensemble"      pct={84} highlight delay={0}/>
                    <BenchBar label="qwen2.5-1.5b"  pct={75} delay={70}/>
                    <BenchBar label="Llama-3.2-1B"  pct={69} delay={140}/>
                    <BenchBar label="unsloth"        pct={39} delay={210}/>
                    <BenchBar label="gemma-2b"       pct={23} delay={280}/>
                  </div>
                  <div style={{ marginTop:14, fontSize:10, fontFamily:'var(--font-mono)',
                    color:'rgba(16,185,129,0.65)', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'#10b981', fontWeight:600 }}>↑ +9pp</span>
                    ensemble lift over best individual
                  </div>
                </div>
              </div>
            </Fade>
          </div>
        </div>
      </section>

      {/* ══ MODEL CARDS ══ */}
      <section style={{ padding:'120px 48px', maxWidth:1400, margin:'0 auto' }}>
        <Fade>
          <span className="wl-section-label">Models tested</span>
          <div style={{ width:36, height:1, background:'linear-gradient(90deg,#10b981,transparent)', margin:'14px 0 48px' }}/>
        </Fade>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { name:'gemma-2b-aps-it',        quant:'Q4_K_M', overall:38.00, factual:54, reasoning:23, coding:37,  note:'Weakest in pool',         hi:false },
            { name:'Llama-3.2-1B-Instruct',  quant:'Q4_K_M', overall:83.67, factual:95, reasoning:69, coding:87,  note:'Strong factual & coding',  hi:false },
            { name:'qwen2.5-1.5b-instruct',  quant:'Q4_K_M', overall:90.00, factual:98, reasoning:75, coding:97,  note:'Best individual model',    hi:true  },
            { name:'unsloth (finetuned)',     quant:'Q4_K_M', overall:58.33, factual:86, reasoning:39, coding:50,  note:'Weak reasoning',           hi:false },
          ].map((m, i) => (
            <Fade key={m.name} delay={i*80}>
              <div style={{
                padding:'22px 20px 20px', borderRadius:14,
                border:`1px solid ${m.hi ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.08)'}`,
                background:`${m.hi ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.02)'}`,
              }}>
                {/* Model name — was 0.55, now 0.75 for non-hi */}
                <div style={{ fontSize:11, fontWeight:600, marginBottom:3, lineHeight:1.4,
                  color: m.hi ? '#10b981' : 'rgba(255,255,255,0.75)' }}>{m.name}</div>
                {/* Quant — was 0.2, now 0.38 */}
                <div style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.38)',
                  marginBottom:18, letterSpacing:'0.08em' }}>{m.quant}</div>
                <div style={{ fontSize:'clamp(22px,2.8vw,30px)', fontWeight:700,
                  fontFamily:'var(--font-mono)', letterSpacing:'-0.03em', marginBottom:18,
                  color: m.hi ? '#10b981' : 'rgba(255,255,255,0.5)' }}>
                  {m.overall}%
                </div>
                {[['Factual',m.factual],['Reasoning',m.reasoning],['Coding',m.coding]].map(([l,v]) => (
                  <div key={l} style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      {/* Sub-labels — was 0.22, now 0.42 */}
                      <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.42)', letterSpacing:'0.08em' }}>{l}</span>
                      <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.52)' }}>{v}%</span>
                    </div>
                    <div style={{ height:2, background:'rgba(255,255,255,0.08)', borderRadius:1, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${v}%`, borderRadius:1,
                        background: v > 80 ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.18)' }}/>
                    </div>
                  </div>
                ))}
                {/* Note — was 0.2, now 0.4 */}
                <div style={{ marginTop:14, fontSize:9, fontFamily:'var(--font-mono)',
                  color:'rgba(255,255,255,0.4)', fontStyle:'italic' }}>{m.note}</div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      {/* ══ BOTTOM CTA ══ */}
      <section style={{
        padding:'120px 48px', textAlign:'center',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        background:'rgba(16,185,129,0.02)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width:700, height:700, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 65%)',
          pointerEvents:'none',
        }}/>
        <Fade style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontSize:9, fontFamily:'var(--font-mono)', letterSpacing:'0.18em',
            textTransform:'uppercase', color:'rgba(16,185,129,0.7)', marginBottom:20 }}>
            Open source · Free forever
          </div>
          <h2 style={{ fontSize:'clamp(30px,5vw,54px)', fontWeight:800,
            letterSpacing:'-0.04em', lineHeight:1.1, marginBottom:20 }}>
            Run your own cluster.<br/>
            <span style={{ color:'rgba(255,255,255,0.3)' }}>Own your AI.</span>
          </h2>
          {/* CTA body — was 0.38, now 0.58 */}
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.58)', maxWidth:400,
            margin:'0 auto 44px', lineHeight:1.78, fontWeight:300 }}>
            Self-hosted, GPU-accelerated, no subscriptions. Selective runs entirely on your hardware.
          </p>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            {isLoggedIn ? (
              <button className="wl-cta-main" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
            ) : (
              <button className="wl-cta-main" onClick={() => navigate('/register')}>Get Started Free</button>
            )}
            <a href={GITHUB_PRODUCT} target="_blank" rel="noreferrer" className="wl-cta-ghost">
              <svg viewBox="0 0 16 16" fill="currentColor" style={{ width:13,height:13 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Download on GitHub
            </a>
            <a href={GITHUB_DATA} target="_blank" rel="noreferrer" className="wl-cta-ghost">
              View Benchmark Data
            </a>
          </div>
        </Fade>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop:'1px solid rgba(255,255,255,0.07)', padding:'24px 48px',
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12,
      }}>
        <div className="nd-logo">
          <div className="nd-logo-mark"><span/><span/><span/><span/></div>
          <div className="nd-logo-text">
            <span className="nd-logo-sub">NeuralDocker</span>
            <span className="nd-logo-name">Selective</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:24, alignItems:'center' }}>
          {[
            { label:'Benchmark Data', href:GITHUB_DATA },
            { label:'GitHub', href:GITHUB_PRODUCT },
            { label:'License', onClick:()=>navigate('/license') },
          ].map((l) => (
            l.href ? (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="wl-footer-link">
                {l.label}
              </a>
            ) : (
              <span key={l.label} onClick={l.onClick} className="wl-footer-link">
                {l.label}
              </span>
            )
          ))}
          {/* Copyright — was 0.14, now 0.3 */}
          <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.3)' }}>
            Academic / Research · All rights reserved
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;