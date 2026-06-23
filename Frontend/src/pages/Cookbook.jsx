import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const MONITOR_API = import.meta.env.VITE_MONITOR_URL || 'http://localhost:8001';

// ── Model Catalog ─────────────────────────────────────────────────
const MODEL_CATALOG = [
  {
    name: 'Llama 3.2 1B Instruct',
    family: 'Llama 3.2',
    params: 1,
    hf_repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    hf_file: q => `Llama-3.2-1B-Instruct-${q}.gguf`,
    use_case: 'Ultra-fast consensus on low-spec hardware. Great for worker nodes.',
    quants: [
      { id: 'Q8_0',   vram_gb: 1.3, ram_gb: 2.0, quality: 'best',    speed: 'fast',   ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 0.8, ram_gb: 1.5, quality: 'good',    speed: 'fast',   ctx: 8192  },
      { id: 'Q2_K',   vram_gb: 0.5, ram_gb: 1.0, quality: 'reduced', speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Llama 3.2 3B Instruct',
    family: 'Llama 3.2',
    params: 3,
    hf_repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    hf_file: q => `Llama-3.2-3B-Instruct-${q}.gguf`,
    use_case: 'Solid reasoning in a tiny footprint. Best bang-for-buck at 3B.',
    quants: [
      { id: 'Q8_0',   vram_gb: 3.3, ram_gb: 4.5, quality: 'best',    speed: 'fast',   ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 2.0, ram_gb: 3.5, quality: 'good',    speed: 'fast',   ctx: 8192  },
      { id: 'Q2_K',   vram_gb: 1.2, ram_gb: 2.5, quality: 'reduced', speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Mistral 7B Instruct v0.3',
    family: 'Mistral',
    params: 7,
    hf_repo: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    hf_file: q => `Mistral-7B-Instruct-v0.3-${q}.gguf`,
    use_case: 'Sharp instruction-following with strong reasoning. A tried-and-true workhorse.',
    quants: [
      { id: 'Q8_0',   vram_gb: 7.7, ram_gb: 9.5,  quality: 'best',    speed: 'medium', ctx: 8192  },
      { id: 'Q5_K_M', vram_gb: 5.2, ram_gb: 7.0,  quality: 'great',   speed: 'medium', ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 4.1, ram_gb: 6.0,  quality: 'good',    speed: 'medium', ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 3.3, ram_gb: 5.0,  quality: 'ok',      speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Llama 3.1 8B Instruct',
    family: 'Llama 3.1',
    params: 8,
    hf_repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    hf_file: q => `Meta-Llama-3.1-8B-Instruct-${q}.gguf`,
    use_case: "Meta's flagship small model. Excellent long-context handling and instruction following.",
    quants: [
      { id: 'Q8_0',   vram_gb: 8.6, ram_gb: 10.5, quality: 'best',    speed: 'medium', ctx: 16384 },
      { id: 'Q5_K_M', vram_gb: 5.7, ram_gb: 7.5,  quality: 'great',   speed: 'medium', ctx: 16384 },
      { id: 'Q4_K_M', vram_gb: 4.7, ram_gb: 6.5,  quality: 'good',    speed: 'medium', ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 3.8, ram_gb: 5.5,  quality: 'ok',      speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Gemma 2 9B Instruct',
    family: 'Gemma 2',
    params: 9,
    hf_repo: 'bartowski/gemma-2-9b-it-GGUF',
    hf_file: q => `gemma-2-9b-it-${q}.gguf`,
    use_case: "Google's Gemma 2. Punches well above its weight on reasoning benchmarks.",
    quants: [
      { id: 'Q8_0',   vram_gb: 9.5, ram_gb: 11.5, quality: 'best',    speed: 'medium', ctx: 8192  },
      { id: 'Q5_K_M', vram_gb: 6.4, ram_gb: 8.0,  quality: 'great',   speed: 'medium', ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 5.2, ram_gb: 7.0,  quality: 'good',    speed: 'medium', ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 4.1, ram_gb: 6.0,  quality: 'ok',      speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Qwen2.5 7B Instruct',
    family: 'Qwen 2.5',
    params: 7,
    hf_repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    hf_file: q => `qwen2.5-7b-instruct-${q.toLowerCase()}.gguf`,
    use_case: 'Strong multilingual model. Excellent code and math. Great diversity pick for consensus.',
    quants: [
      { id: 'Q8_0',   vram_gb: 7.7, ram_gb: 9.5,  quality: 'best',    speed: 'medium', ctx: 16384 },
      { id: 'Q5_K_M', vram_gb: 5.2, ram_gb: 7.0,  quality: 'great',   speed: 'medium', ctx: 16384 },
      { id: 'Q4_K_M', vram_gb: 4.1, ram_gb: 6.0,  quality: 'good',    speed: 'medium', ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 3.3, ram_gb: 5.0,  quality: 'ok',      speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Phi-3.5 Mini Instruct',
    family: 'Phi',
    params: 3.8,
    hf_repo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    hf_file: q => `Phi-3.5-mini-instruct-${q}.gguf`,
    use_case: "Microsoft's compact powerhouse. Exceptional reasoning for its size.",
    quants: [
      { id: 'Q8_0',   vram_gb: 4.1, ram_gb: 5.5,  quality: 'best',    speed: 'fast',   ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 2.4, ram_gb: 4.0,  quality: 'good',    speed: 'fast',   ctx: 8192  },
      { id: 'Q2_K',   vram_gb: 1.4, ram_gb: 2.5,  quality: 'reduced', speed: 'fast',   ctx: 4096  },
    ],
  },
  {
    name: 'Llama 3.1 70B Instruct',
    family: 'Llama 3.1',
    params: 70,
    hf_repo: 'bartowski/Meta-Llama-3.1-70B-Instruct-GGUF',
    hf_file: q => `Meta-Llama-3.1-70B-Instruct-${q}.gguf`,
    use_case: 'Frontier-class local model. Needs serious VRAM — but the output quality is remarkable.',
    quants: [
      { id: 'Q5_K_M', vram_gb: 49,  ram_gb: 55,  quality: 'great',   speed: 'slow',   ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 40,  ram_gb: 46,  quality: 'good',    speed: 'slow',   ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 32,  ram_gb: 38,  quality: 'ok',      speed: 'slow',   ctx: 4096  },
      { id: 'Q2_K',   vram_gb: 26,  ram_gb: 32,  quality: 'reduced', speed: 'medium', ctx: 4096  },
    ],
  },
  {
    name: 'DeepSeek-R1 7B',
    family: 'DeepSeek',
    params: 7,
    hf_repo: 'bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    hf_file: q => `DeepSeek-R1-Distill-Qwen-7B-${q}.gguf`,
    use_case: 'Reasoning-focused model with chain-of-thought. Great for consensus diversity.',
    quants: [
      { id: 'Q8_0',   vram_gb: 7.7, ram_gb: 9.5,  quality: 'best',    speed: 'medium', ctx: 8192  },
      { id: 'Q5_K_M', vram_gb: 5.2, ram_gb: 7.0,  quality: 'great',   speed: 'medium', ctx: 8192  },
      { id: 'Q4_K_M', vram_gb: 4.1, ram_gb: 6.0,  quality: 'good',    speed: 'medium', ctx: 8192  },
    ],
  },
  {
    name: 'Mistral 12B Nemo',
    family: 'Mistral',
    params: 12,
    hf_repo: 'bartowski/Mistral-Nemo-Instruct-2407-GGUF',
    hf_file: q => `Mistral-Nemo-Instruct-2407-${q}.gguf`,
    use_case: "Mistral's 12B with 128k context. Better reasoning than 7B at modest extra cost.",
    quants: [
      { id: 'Q8_0',   vram_gb: 12.5, ram_gb: 15,  quality: 'best',    speed: 'medium', ctx: 32768 },
      { id: 'Q5_K_M', vram_gb: 8.5,  ram_gb: 11,  quality: 'great',   speed: 'medium', ctx: 16384 },
      { id: 'Q4_K_M', vram_gb: 7.0,  ram_gb: 9.5, quality: 'good',    speed: 'medium', ctx: 8192  },
      { id: 'Q3_K_M', vram_gb: 5.5,  ram_gb: 8.0, quality: 'ok',      speed: 'fast',   ctx: 4096  },
    ],
  },
];

// ── Recommendation engine ─────────────────────────────────────────
const VRAM_SAFETY_MARGIN = 1.0;

function recommend(hw) {
  const freeVram = Math.max(0, (hw.vram_total || 0) - VRAM_SAFETY_MARGIN);
  const freeRam  = Math.max(0, (hw.ram_total  || 0) - 4);
  const results  = [];

  for (const model of MODEL_CATALOG) {
    let best = null;
    let mode = null;

    for (const q of model.quants) {
      if (q.vram_gb <= freeVram) {
        best = q; mode = 'gpu';
        break;
      }
    }

    if (!best) {
      for (const q of [...model.quants].reverse()) {
        if (q.ram_gb <= freeRam) {
          best = q; mode = 'cpu';
          break;
        }
      }
    }

    if (!best) continue;

    const tier = mode === 'cpu' ? 'cpu'
      : best.vram_gb > freeVram * 0.85 ? 'tight'
      : 'great';

    const safeCtx = mode === 'gpu'
      ? Math.min(best.ctx, Math.floor(freeVram / best.vram_gb * best.ctx * 0.7))
      : Math.min(best.ctx, 4096);

    const gpuLayers = mode === 'gpu' ? Math.floor((freeVram / best.vram_gb) * 32) : 0;

    results.push({ model, quant: best, mode, tier, safeCtx, gpuLayers });
  }

  const tierOrder = { great: 0, tight: 1, cpu: 2 };
  results.sort((a, b) => {
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    return a.model.params - b.model.params;
  });

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────
const QUALITY_LABEL = { best: 'Lossless', great: 'Near-lossless', good: 'Good', ok: 'Acceptable', reduced: 'Reduced' };
const SPEED_LABEL   = { fast: 'Fast', medium: 'Medium', slow: 'Slow' };
const hfLink     = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;
const hfRepoLink = repo => `https://huggingface.co/${repo}`;
const fmtCtx  = n => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;
const fmtVram = n => n >= 1 ? `${n.toFixed(1)} GB` : `${(n * 1024).toFixed(0)} MB`;

const TIER_CFG = {
  great: { label: 'Runs great',       color: 'var(--accent)',  dim: 'var(--accent-dim)',  border: 'var(--accent-border)' },
  tight: { label: 'Tight fit',        color: 'var(--yellow)',  dim: 'var(--yellow-dim)',  border: 'rgba(245,158,11,0.25)' },
  cpu:   { label: 'CPU only',         color: 'var(--red)',     dim: 'var(--red-dim)',     border: 'rgba(239,68,68,0.25)' },
};

export default function Cookbook() {
  const navigate = useNavigate();
  const accountName    = localStorage.getItem('accountName') || 'User';
  const userEmail      = localStorage.getItem('userEmail') || '';
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const profileRef = useRef(null);

  const getClusterPath = () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || sessionStorage.getItem('clusterId');
    return id ? `/cluster?id=${id}` : '/cluster';
  };

  const [hw, setHw]           = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [recs, setRecs]       = useState([]);
  const [copied, setCopied]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const handler = e => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`${MONITOR_API}/api/system-stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const gpu = data.gpu?.[0];
        const parsed = {
          cpu_name:    data.cpu?.name || 'Unknown CPU',
          cpu_cores:   data.cpu?.cores || 0,
          cpu_threads: data.cpu?.threads || 0,
          ram_total:   data.memory?.total || 0,
          ram_free:    data.memory?.available || 0,
          vram_total:  gpu?.memory_total || 0,
          vram_free:   gpu ? gpu.memory_total - gpu.memory_used : 0,
          gpu_name:    gpu?.name || null,
          has_gpu:     !!gpu,
        };
        setHw(parsed);
        setRecs(recommend(parsed));
      } catch (e) {
        setError(`Cannot reach system monitor: ${e.message}. Make sure Docker is running.`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const handleLogout = () => {
    ['token','userEmail','accountName','userId'].forEach(k => localStorage.removeItem(k));
    navigate('/');
  };

  const filtered = filter === 'all' ? recs : recs.filter(r => r.tier === filter);
  const counts   = {
    great: recs.filter(r => r.tier === 'great').length,
    tight: recs.filter(r => r.tier === 'tight').length,
    cpu:   recs.filter(r => r.tier === 'cpu').length,
  };

  return (
  <div style={{ background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-sans)', minHeight:'100vh' }}>
    <style>{`
      .ck-page { max-width:1040px; margin:0 auto; padding:36px 24px 80px; }

      /* Hero */
      .ck-hero { margin-bottom:32px; }
      .ck-hero-eyebrow { font-family:var(--font-mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin-bottom:10px; display:flex; align-items:center; gap:8px; }
      .ck-hero-eyebrow::before { content:''; display:block; width:20px; height:1px; background:var(--accent); }
      .ck-hero h1 { font-size:28px; font-weight:700; letter-spacing:-.02em; line-height:1.2; margin-bottom:10px; }
      .ck-hero h1 em { color:var(--accent); font-style:normal; }
      .ck-hero p { font-size:13px; color:var(--text-mid); line-height:1.7; max-width:540px; }

      /* Hardware strip */
      .ck-hw-strip { display:grid; grid-template-columns:repeat(auto-fit, minmax(155px,1fr)); gap:8px; margin-bottom:28px; }
      .ck-hw-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; }
      .ck-hw-card label { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:rgba(255,255,255,0.42); font-family:var(--font-mono); margin-bottom:7px; }
      .ck-hw-card .val { font-family:var(--font-mono); font-size:17px; font-weight:600; }
      .ck-hw-card .sub { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); margin-top:3px; }
      .ck-hw-card.accent { border-color:var(--accent-border); background:var(--accent-dim); }

      /* Filter bar */
      .ck-filters { display:flex; align-items:center; gap:6px; margin-bottom:18px; flex-wrap:wrap; }
      .ck-filter-btn { display:flex; align-items:center; gap:6px; background:none; border:1px solid var(--border-mid); color:var(--text-mid); font-family:var(--font-mono); font-size:11px; padding:5px 12px; border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition); }
      .ck-filter-btn:hover { border-color:var(--border-bright); color:var(--text-mid); }
      .ck-filter-btn.active { border-color:var(--accent-border); color:var(--accent); background:var(--accent-dim); }
      .ck-filter-dot { width:5px; height:5px; border-radius:50%; }
      .ck-count-badge { font-size:9px; background:rgba(255,255,255,0.06); border-radius:3px; padding:1px 5px; }

      /* Cards */
      .ck-recs { display:flex; flex-direction:column; gap:8px; }
      .ck-card { border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg2); overflow:hidden; transition:border-color var(--transition); }
      .ck-card:hover { border-color:var(--border-bright); }
      .ck-card.expanded { border-color:var(--border-bright); }
      .ck-card-head { display:flex; align-items:center; gap:14px; padding:15px 18px; cursor:pointer; user-select:none; }
      .ck-card-tier-bar { width:2px; height:36px; border-radius:2px; flex-shrink:0; }
      .ck-card-info { flex:1; min-width:0; }
      .ck-card-name { font-size:13px; font-weight:500; margin-bottom:4px; display:flex; align-items:center; gap:8px; }
      .ck-card-family { font-size:10px; font-family:var(--font-mono); color:rgba(255,255,255,0.38); font-weight:400; }
      .ck-card-meta { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .ck-card-meta span { font-family:var(--font-mono); font-size:10px; color:var(--text-mid); }
      .ck-card-right { display:flex; align-items:center; gap:12px; flex-shrink:0; }
      .ck-tier-pill { display:flex; align-items:center; gap:5px; padding:3px 9px; border-radius:var(--radius-sm); font-size:9px; font-family:var(--font-mono); font-weight:600; letter-spacing:.06em; border:1px solid; }
      .ck-chevron { color:var(--text-dim); transition:transform .2s; flex-shrink:0; }
      .ck-card.expanded .ck-chevron { transform:rotate(180deg); }
      .ck-card-body { border-top:1px solid var(--border); padding:18px; display:none; }
      .ck-card.expanded .ck-card-body { display:block; }

      /* Body content */
      .ck-body-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
      @media(max-width:600px) { .ck-body-grid { grid-template-columns:1fr; } }
      .ck-detail-block { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); padding:13px 15px; }
      .ck-detail-block h4 { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-dim); font-family:var(--font-mono); margin-bottom:10px; }
      .ck-detail-row { display:flex; justify-content:space-between; align-items:baseline; padding:5px 0; border-bottom:1px solid var(--border); }
      .ck-detail-row:last-child { border-bottom:none; }
      .ck-detail-row label { font-size:11px; color:var(--text-mid); }
      .ck-detail-row value { font-family:var(--font-mono); font-size:11px; }

      .ck-use-case { background:var(--accent-dim); border:1px solid var(--accent-border); border-radius:var(--radius-md); padding:11px 14px; font-size:12px; color:var(--text-mid); line-height:1.6; margin-bottom:14px; }
      .ck-use-case strong { color:var(--accent); font-size:9px; text-transform:uppercase; letter-spacing:.1em; font-family:var(--font-mono); display:block; margin-bottom:4px; }

      /* Download rows */
      .ck-dl-section h4 { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-dim); font-family:var(--font-mono); margin-bottom:8px; }
      .ck-dl-row { display:flex; align-items:center; gap:10px; background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); padding:9px 12px; margin-bottom:6px; transition:border-color var(--transition); }
      .ck-dl-row:hover { border-color:var(--border-bright); }
      .ck-dl-row.recommended { border-color:var(--accent-border); background:var(--accent-dim); }
      .ck-dl-filename { font-family:var(--font-mono); font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ck-dl-meta { display:flex; gap:7px; margin-top:3px; }
      .ck-dl-meta span { font-family:var(--font-mono); font-size:9px; color:var(--text-dim); }
      .ck-dl-actions { display:flex; gap:5px; flex-shrink:0; }
      .ck-btn { display:flex; align-items:center; gap:4px; font-size:10px; font-family:var(--font-mono); padding:4px 9px; border-radius:var(--radius-sm); cursor:pointer; transition:all var(--transition); white-space:nowrap; font-weight:500; text-decoration:none; }
      .ck-btn-ghost { background:none; border:1px solid var(--border-bright); color:var(--text-dim); }
      .ck-btn-ghost:hover { border-color:var(--border-bright); color:var(--text-mid); }
      .ck-btn-accent { background:var(--accent-dim); border:1px solid var(--accent-border); color:var(--accent); }
      .ck-btn-accent:hover { background:var(--accent-glow); }
      .ck-btn.copied { color:var(--accent) !important; border-color:var(--accent-border) !important; }
      .ck-recommended-tag { font-size:9px; background:var(--accent-dim); color:var(--accent); border:1px solid var(--accent-border); padding:1px 6px; border-radius:3px; margin-left:6px; }

      /* Quant table */
      .ck-quant-table { width:100%; border-collapse:collapse; font-family:var(--font-mono); font-size:11px; }
      .ck-quant-table th { text-align:left; padding:6px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-dim); border-bottom:1px solid var(--border); }
      .ck-quant-table td { padding:6px 8px; border-bottom:1px solid var(--border); color:var(--text-mid); }
      .ck-quant-table tr:last-child td { border-bottom:none; }
      .ck-quant-table tr.recommended td { color:var(--text); background:rgba(255,255,255,0.02); }

      /* Warnings */
      .ck-warn { display:flex; align-items:flex-start; gap:8px; background:rgba(245,158,11,.05); border:1px solid rgba(245,158,11,.2); border-radius:var(--radius-md); padding:9px 12px; font-size:11px; color:rgba(245,158,11,.8); line-height:1.6; margin-bottom:12px; }
      .ck-warn.red { background:var(--red-dim); border-color:rgba(239,68,68,.2); color:rgba(239,68,68,.8); }

      /* Section divider */
      .ck-section-divider { font-family:var(--font-mono); font-size:9px; text-transform:uppercase; letter-spacing:.14em; color:rgba(255,255,255,0.38); padding:10px 0 6px; display:flex; align-items:center; gap:10px; }
      .ck-section-divider::after { content:''; flex:1; height:1px; background:var(--border); }

      /* Loading / error */
      .ck-loading { display:flex; flex-direction:column; align-items:center; gap:14px; padding:72px 20px; color:var(--text-dim); }
      .ck-error { background:var(--red-dim); border:1px solid rgba(239,68,68,.2); border-radius:var(--radius-lg); padding:18px 22px; color:var(--red); font-size:13px; line-height:1.6; }
      .ck-empty { text-align:center; padding:52px 20px; color:var(--text-dim); }

      /* Glossary */
      .ck-glossary-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px,1fr)); gap:8px; }
      .ck-glossary-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-md); padding:11px 13px; }
      .ck-glossary-term { font-family:var(--font-mono); font-size:11px; color:var(--accent); margin-bottom:4px; }
      .ck-glossary-def { font-size:11px; color:var(--text-mid); line-height:1.6; }

      .spin { display:inline-block; animation:ck-spin .7s linear infinite; }
      @keyframes ck-spin { to { transform:rotate(360deg); } }
    `}</style>

    {/* NAV */}
    <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:'var(--nav-height)', borderBottom:'1px solid var(--border)', background:'var(--bg)', position:'sticky', top:0, zIndex:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:20 }}>
        <div className="nd-logo" style={{ cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
          <div className="nd-logo-mark"><span/><span/><span/><span/></div>
          <div className="nd-logo-text">
            <span className="nd-logo-sub">NeuralDocker</span>
            <span className="nd-logo-name">Selective</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:2 }}>
          {[['Dashboard','/dashboard'],['Cluster', getClusterPath()]].map(([l,p]) => (
            <button key={l} onClick={() => navigate(p)} style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }}>{l}</button>
          ))}
          <button style={{ background:'var(--accent-dim)', border:'none', fontSize:12, fontWeight:500, color:'var(--accent)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }}>Cookbook</button>
        </div>
      </div>
      <div ref={profileRef} style={{ display:'flex', alignItems:'center', gap:10, position:'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
          <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{userEmail}</div>
        </div>
        <div className="nd-avatar" onClick={() => setProfileOpen(v => !v)}>{avatarInitials}</div>
        {profileOpen && (
          <div className="nd-profile-dropdown animate-in">
            <button onClick={() => navigate('/dashboard')}>Dashboard</button>
            <div className="nd-divider" style={{ margin:'2px 0' }}/>
            <button className="danger" onClick={handleLogout}>Log Out</button>
          </div>
        )}
      </div>
    </nav>

    <div className="ck-page">

      {/* HERO */}
      <div className="ck-hero">
        <div className="ck-hero-eyebrow">Model Cookbook</div>
        <h1>What can <em>your machine</em> run?</h1>
        <p>
          Scanned your hardware and matched it against {MODEL_CATALOG.length} curated GGUF models.
          Every recommendation is tuned to your actual VRAM and RAM — with the right quantization,
          context window, and a direct download link.
        </p>
      </div>

      {loading ? (
        <div className="ck-loading">
          <span className="spin" style={{ fontSize:22 }}>⟳</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>Scanning hardware…</span>
        </div>
      ) : error ? (
        <div className="ck-error">⚠ {error}</div>
      ) : (
        <>
          {/* HARDWARE STRIP */}
          <div className="ck-hw-strip">
            <div className={`ck-hw-card ${hw.has_gpu ? 'accent' : ''}`}>
              <label>GPU</label>
              <div className="val" style={{ color: hw.has_gpu ? 'var(--accent)' : 'var(--text-dim)', fontSize: hw.gpu_name && hw.gpu_name.length > 20 ? 11 : 15, fontFamily:'var(--font-mono)' }}>
                {hw.gpu_name || 'None detected'}
              </div>
              {hw.has_gpu && <div className="sub">{fmtVram(hw.vram_total)} VRAM</div>}
            </div>
            <div className="ck-hw-card">
              <label>Free VRAM</label>
              <div className="val" style={{ color: hw.vram_free > 4 ? 'var(--accent)' : hw.vram_free > 1 ? 'var(--yellow)' : 'var(--red)' }}>
                {hw.has_gpu ? fmtVram(hw.vram_free) : '—'}
              </div>
              <div className="sub">{hw.has_gpu ? `of ${fmtVram(hw.vram_total)} total` : 'No GPU'}</div>
            </div>
            <div className="ck-hw-card">
              <label>System RAM</label>
              <div className="val">{hw.ram_total.toFixed(1)} GB</div>
              <div className="sub">{hw.ram_free.toFixed(1)} GB available</div>
            </div>
            <div className="ck-hw-card">
              <label>CPU</label>
              <div className="val" style={{ fontSize:11, fontFamily:'var(--font-mono)', paddingTop:4, color:'var(--text-mid)' }}>{hw.cpu_name}</div>
              <div className="sub">{hw.cpu_cores}c / {hw.cpu_threads}t</div>
            </div>
            <div className="ck-hw-card" style={{ borderStyle:'dashed' }}>
              <label>Models Found</label>
              <div className="val">{recs.length}</div>
              <div className="sub">{counts.great} great · {counts.tight} tight · {counts.cpu} cpu</div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="ck-filters">
            {[
              { key:'all',   label:'All',            dot:'var(--text-dim)' },
              { key:'great', label:'Runs great',     dot:'var(--accent)' },
              { key:'tight', label:'With limits',    dot:'var(--yellow)' },
              { key:'cpu',   label:'CPU only',       dot:'var(--red)' },
            ].map(f => (
              <button key={f.key} className={`ck-filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                <div className="ck-filter-dot" style={{ background: filter === f.key ? 'var(--accent)' : f.dot }}/>
                {f.label}
                <span className="ck-count-badge">{f.key === 'all' ? recs.length : counts[f.key]}</span>
              </button>
            ))}
          </div>

          {/* TIER CONFIG using theme vars */}
          {(() => {
            const TC = {
              great: { label:'Runs great',       dot:'var(--accent)',  bg:'var(--accent-dim)',           border:'var(--accent-border)',        text:'var(--accent)' },
              tight: { label:'Runs with limits', dot:'var(--yellow)',  bg:'rgba(245,158,11,.06)',        border:'rgba(245,158,11,.2)',          text:'var(--yellow)' },
              cpu:   { label:'CPU only',         dot:'var(--red)',     bg:'var(--red-dim)',              border:'rgba(239,68,68,.2)',           text:'var(--red)' },
            };

            return (
              <div className="ck-recs">
                {filtered.length === 0 ? (
                  <div className="ck-empty">
                    <div style={{ fontSize:28, opacity:.25, marginBottom:10 }}>⬡</div>
                    <div style={{ fontSize:13, color:'var(--text-dim)' }}>No models match this filter.</div>
                  </div>
                ) : filtered.map((rec, idx) => {
                  const { model, quant, mode, tier, safeCtx, gpuLayers } = rec;
                  const tc = TC[tier];
                  const isExpanded = expandedId === model.name;
                  const filename = model.hf_file(quant.id);
                  const dlUrl = hfLink(model.hf_repo, filename);
                  const repoUrl = hfRepoLink(model.hf_repo);
                  const prevTier = idx > 0 ? filtered[idx-1].tier : null;
                  const showDivider = idx > 0 && tier !== prevTier;

                  return (
                    <React.Fragment key={model.name}>
                      {showDivider && (
                        <div className="ck-section-divider">{tc.label}</div>
                      )}
                      <div className={`ck-card ${isExpanded ? 'expanded' : ''}`}>

                        {/* Header */}
                        <div className="ck-card-head" onClick={() => setExpandedId(isExpanded ? null : model.name)}>
                          <div className="ck-card-tier-bar" style={{ background: tc.dot }}/>
                          <div className="ck-card-info">
                            <div className="ck-card-name">
                              {model.name}
                              <span className="ck-card-family">{model.params}B</span>
                            </div>
                            <div className="ck-card-meta">
                              <span>{quant.id}</span>
                              <span>{fmtVram(mode === 'gpu' ? quant.vram_gb : quant.ram_gb)} {mode === 'gpu' ? 'VRAM' : 'RAM'}</span>
                              <span>{fmtCtx(safeCtx)} ctx</span>
                              <span>{SPEED_LABEL[quant.speed]}</span>
                              <span style={{ 
                                color: mode === 'gpu' ? 'var(--accent)' : 'var(--red)', 
                                background: mode === 'gpu' ? 'var(--accent-dim)' : 'var(--red-dim)', 
                                border: `1px solid ${mode === 'gpu' ? 'var(--accent-border)' : 'rgba(239,68,68,.2)'}`, 
                                padding:'1px 6px', borderRadius:3, fontSize:9, fontWeight:600, letterSpacing:'.06em' 
                              }}>
                                {mode === 'gpu' ? 'GPU' : 'CPU'}
                              </span>
                            </div>
                          </div>
                          <div className="ck-card-right">
                            <div className="ck-tier-pill" style={{ background:tc.bg, borderColor:tc.border, color:tc.text }}>
                              <div style={{ width:5, height:5, borderRadius:'50%', background:tc.dot }}/>
                              {tc.label}
                            </div>
                            <svg className="ck-chevron" viewBox="0 0 14 14" fill="none" width="13" height="13">
                              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>

                        {/* Body */}
                        <div className="ck-card-body">
                          {tier === 'tight' && <div className="ck-warn">⚠ Fits your VRAM but leaves little headroom. Use a lower context window if you experience slowdowns or OOM errors.</div>}
                          {tier === 'cpu' && <div className="ck-warn red">⊡ No GPU fit — runs on CPU. Inference will be slower. Consider a smaller model or lower quantization for GPU use.</div>}

                          <div className="ck-use-case">
                            <strong>Best for</strong>
                            {model.use_case}
                          </div>

                          <div className="ck-body-grid">
                            <div className="ck-detail-block">
                              <h4>Recommended Settings</h4>
                              {[
                                ['Quantization', quant.id, 'var(--accent)'],
                                ['Quality', QUALITY_LABEL[quant.quality], null],
                                ['Context window', `${fmtCtx(safeCtx)} tokens`, null],
                                ['GPU layers', gpuLayers > 0 ? `~${gpuLayers}` : 'CPU only', gpuLayers > 0 ? 'var(--accent)' : 'var(--text-dim)'],
                                ['Speed', SPEED_LABEL[quant.speed], null],
                              ].map(([l,v,c]) => (
                                <div key={l} className="ck-detail-row">
                                  <label>{l}</label>
                                  <value style={c ? { color:c } : {}}>{v}</value>
                                </div>
                              ))}
                            </div>
                            <div className="ck-detail-block">
                              <h4>Resource Usage</h4>
                              {[
                                ['VRAM required', fmtVram(quant.vram_gb), null],
                                ['RAM required', fmtVram(quant.ram_gb), null],
                                ['Inference mode', mode === 'gpu' ? 'GPU (CUDA)' : 'CPU', mode === 'gpu' ? 'var(--accent)' : 'var(--red)'],
                                ['Max context', `${fmtCtx(quant.ctx)} tokens`, null],
                                ['Parameters', `${model.params}B`, null],
                              ].map(([l,v,c]) => (
                                <div key={l} className="ck-detail-row">
                                  <label>{l}</label>
                                  <value style={c ? { color:c } : {}}>{v}</value>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Downloads */}
                          <div className="ck-dl-section">
                            <h4>Download — drop into /models folder</h4>
                            <div className="ck-dl-row recommended">
                              <div style={{ flex:1, minWidth:0 }}>
                                <div className="ck-dl-filename">
                                  {filename}
                                  <span className="ck-recommended-tag">recommended</span>
                                </div>
                                <div className="ck-dl-meta">
                                  <span>{quant.id}</span>
                                  <span>~{fmtVram(quant.vram_gb)} VRAM</span>
                                  <span>{QUALITY_LABEL[quant.quality]}</span>
                                </div>
                              </div>
                              <div className="ck-dl-actions">
                                <button className={`ck-btn ck-btn-ghost ${copied === filename ? 'copied' : ''}`} onClick={() => copyText(filename, filename)}>
                                  {copied === filename ? '✓' : 'Copy name'}
                                </button>
                                <a href={dlUrl} target="_blank" rel="noopener noreferrer" className="ck-btn ck-btn-accent" style={{ textDecoration:'none' }}>
                                  ↓ HuggingFace
                                </a>
                              </div>
                            </div>

                            {model.quants.filter(q => q.id !== quant.id).slice(0, 3).map(q => {
                              const altFile = model.hf_file(q.id);
                              const altFits = mode === 'gpu'
                                ? q.vram_gb <= (hw.vram_free - VRAM_SAFETY_MARGIN)
                                : q.ram_gb <= (hw.ram_total - 4);
                              return (
                                <div key={q.id} className="ck-dl-row" style={{ opacity: altFits ? 1 : 0.5 }}>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div className="ck-dl-filename">{altFile}</div>
                                    <div className="ck-dl-meta">
                                      <span>{q.id}</span>
                                      <span>~{fmtVram(q.vram_gb)} VRAM</span>
                                      <span>{QUALITY_LABEL[q.quality]}</span>
                                      {!altFits && <span style={{ color:'var(--red)' }}>may not fit</span>}
                                    </div>
                                  </div>
                                  <div className="ck-dl-actions">
                                    <button className={`ck-btn ck-btn-ghost ${copied === altFile ? 'copied' : ''}`} onClick={() => copyText(altFile, altFile)}>
                                      {copied === altFile ? '✓' : 'Copy'}
                                    </button>
                                    <a href={hfLink(model.hf_repo, altFile)} target="_blank" rel="noopener noreferrer" className="ck-btn ck-btn-ghost" style={{ textDecoration:'none' }}>↓ HF</a>
                                  </div>
                                </div>
                              );
                            })}

                            <div style={{ marginTop:8, display:'flex', justifyContent:'flex-end' }}>
                              <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="ck-btn ck-btn-ghost" style={{ textDecoration:'none' }}>View all on HuggingFace →</a>
                            </div>
                          </div>

                          {/* Quant comparison table */}
                          {model.quants.length > 1 && (
                            <div style={{ marginTop:14 }}>
                              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'.12em', color:'var(--text-dim)', marginBottom:8 }}>All quantizations</div>
                              <div className="ck-detail-block" style={{ padding:0, overflow:'hidden' }}>
                                <table className="ck-quant-table">
                                  <thead>
                                    <tr><th>Quant</th><th>VRAM</th><th>RAM</th><th>Quality</th><th>Max Ctx</th><th>Fits?</th></tr>
                                  </thead>
                                  <tbody>
                                    {model.quants.map(q => {
                                      const gpuFit = q.vram_gb <= (hw.vram_free - VRAM_SAFETY_MARGIN);
                                      const cpuFit = q.ram_gb <= (hw.ram_total - 4);
                                      return (
                                        <tr key={q.id} className={q.id === quant.id ? 'recommended' : ''}>
                                          <td>
                                            {q.id}
                                            {q.id === quant.id && <span className="ck-recommended-tag">rec.</span>}
                                          </td>
                                          <td>{fmtVram(q.vram_gb)}</td>
                                          <td>{fmtVram(q.ram_gb)}</td>
                                          <td>{QUALITY_LABEL[q.quality]}</td>
                                          <td>{fmtCtx(q.ctx)}</td>
                                          <td style={{ color: gpuFit ? 'var(--accent)' : cpuFit ? 'var(--yellow)' : 'var(--red)' }}>
                                            {gpuFit ? '◈ GPU' : cpuFit ? '⊡ CPU' : '✕ No fit'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}

          {/* GLOSSARY */}
          <div style={{ marginTop:44, paddingTop:28, borderTop:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'.14em', color:'var(--text-dim)', marginBottom:14 }}>Quick reference</div>
            <div className="ck-glossary-grid">
              {[
                { term:'Q4_K_M', def:'4-bit quantized, K-means, medium. Best balance of size and quality.' },
                { term:'Q8_0',   def:'8-bit. Near-lossless quality at ~2× the VRAM of Q4.' },
                { term:'Q5_K_M', def:'5-bit. A sweet spot — sharper than Q4 with modest extra VRAM.' },
                { term:'Q2_K',   def:'2-bit. Very small, noticeably reduced quality. Last resort for tiny VRAM.' },
                { term:'Context window', def:'Tokens the model can "see" at once. Higher = richer context but more VRAM.' },
                { term:'GPU layers', def:'Model layers offloaded to GPU. More layers = faster inference.' },
              ].map(g => (
                <div key={g.term} className="ck-glossary-card">
                  <div className="ck-glossary-term">{g.term}</div>
                  <div className="ck-glossary-def">{g.def}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);
}