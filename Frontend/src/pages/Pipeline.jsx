import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getClusterAPI } from '../config';


const CHECKPOINT_EVERY = 10;       // batch checkpoint to backend every N answered questions
const STATUS_POLL_MS = 3000;       // how often to poll cluster-status while waiting on session
const MIN_QUESTION_GAP_MS = 400;   // floor — never fire questions faster than this

// ── Question parser — **Q001.** Question text ─────────────────────────────────
function parseQuestions(text) {
  const pattern = /\*\*(Q(\d{3,4}))\.\*\*\s*([\s\S]*?)(?=\*\*Q\d{3,4}\.\*\*|$)/g;
  const questions = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[3].trim().replace(/\n---[\s\S]*$/, '').trim();
    if (raw) questions.push({ qid: match[1], text: raw });
  }
  return questions;
}

// ── Output file builder ───────────────────────────────────────────────────────
function buildOutputMd(questions, answers, sourceName, outputMode, clusterName) {
  const now = new Date().toLocaleString();
  const lines = [
    `# Pipeline Answers — ${sourceName}`,
    `Generated: ${now}`,
    `Cluster: ${clusterName || 'Unknown'}`,
    `Output mode: ${outputMode === 'ALL_MODELS' ? 'All models' : 'Winner only'}`,
    '',
    '---',
    '',
  ];

  for (const q of questions) {
    const a = answers[q.qid];
    if (!a) continue;

    if (a.error) {
      lines.push(`**${q.qid}.** (error: ${a.error})`);
      lines.push('');
      continue;
    }

    if (outputMode === 'ALL_MODELS' && Array.isArray(a.models) && a.models.length > 0) {
      lines.push(`**${q.qid}.**`);
      lines.push('');
      for (const m of a.models) {
        const isWinner = m.model === a.winnerModel;
        lines.push(`- **${m.model}**${isWinner ? ' (winner)' : ''} — score ${Number(m.avg_score).toFixed(2)}`);
        lines.push(`  ${(m.answer || '').trim()}`);
      }
      lines.push('');
    } else {
      lines.push(`**${q.qid}.** ${(a.winnerAnswer || '').trim()}`);
      lines.push('');
    }
  }

  // Leaderboard footer when we have per-model data
  const tally = {};
  for (const qid of Object.keys(answers)) {
    const a = answers[qid];
    if (a.error || !Array.isArray(a.models)) continue;
    for (const m of a.models) {
      tally[m.model] = tally[m.model] || { wins: 0, votes: 0, scoreSum: 0 };
      tally[m.model].votes += 1;
      tally[m.model].scoreSum += Number(m.avg_score) || 0;
      if (m.model === a.winnerModel) tally[m.model].wins += 1;
    }
  }
  const names = Object.keys(tally);
  if (names.length > 0) {
    lines.push('---', '', '## Model Leaderboard (this run)', '');
    lines.push('| Model | Wins | Votes | Avg Score |');
    lines.push('|---|---|---|---|');
    names
      .sort((a, b) => tally[b].wins - tally[a].wins)
      .forEach(name => {
        const t = tally[name];
        lines.push(`| ${name} | ${t.wins} | ${t.votes} | ${(t.scoreSum / t.votes).toFixed(2)} |`);
      });
    lines.push('');
  }

  return lines.join('\n');
}

const MODEL_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#059669', '#a7f3d0', '#047857'];
const RUN_ID_KEY = 'nd_pipeline_run_id';

export default function Pipeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterIdParam = searchParams.get('id') ? parseInt(searchParams.get('id')) : null;
  const token = localStorage.getItem('token');
  const accountName = localStorage.getItem('accountName') || 'User';
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // ── Cluster/model data ─────────────────────────────────────────────────────
  const [endpointData, setEndpointData] = useState(null);
  const [endpointError, setEndpointError] = useState('');
  const [loadingEndpoints, setLoadingEndpoints] = useState(true);

  useEffect(() => {
    if (!clusterIdParam) {
      setEndpointError('No cluster selected — open Pipeline from the cluster dashboard.');
      setLoadingEndpoints(false);
      return;
    }
    fetch(`${getClusterAPI()}/api/v1/clusters/api-endpoints?clusterId=${clusterIdParam}`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'Failed')))
      .then(d => { setEndpointData(d); setEndpointError(''); })
      .catch(e => setEndpointError(String(e)))
      .finally(() => setLoadingEndpoints(false));
  }, [token, clusterIdParam]);

  // ── Configuration ──────────────────────────────────────────────────────────
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful and knowledgeable assistant. Answer the question accurately and concisely.');
  const [outputMode, setOutputMode] = useState('WINNER_ONLY'); // WINNER_ONLY | ALL_MODELS
  const [questionFilter, setQuestionFilter] = useState('all');
  const [filterFrom, setFilterFrom] = useState(1);
  const [filterTo, setFilterTo] = useState(50);
  const [filterFirst, setFilterFirst] = useState(10);

  // ── File state ─────────────────────────────────────────────────────────────
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Run state ──────────────────────────────────────────────────────────────
  const [runId, setRunId] = useState(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [answers, setAnswers] = useState({});           // { qid: { winnerModel, winnerAnswer, models: [...], error? } }
  const [log, setLog] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [outputMd, setOutputMd] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);  // { progress, limit }
  const [reconnectOffer, setReconnectOffer] = useState(null); // run summary from backend, awaiting user choice

  const pausedRef = useRef(false);
  const abortRef = useRef(false);
  const logRef = useRef(null);
  const lastCheckpointedCountRef = useRef(0); // how many answers were in the map at the last successful PATCH

  useEffect(() => () => { abortRef.current = true; }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [running, done, startTime]);

  // ── Reconnect check on mount ───────────────────────────────────────────────
  useEffect(() => {
    const savedId = localStorage.getItem(RUN_ID_KEY);
    if (!savedId) return;
    fetch(`${getClusterAPI()}/api/v1/pipeline/runs/${savedId}`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(run => {
        if (run.status === 'RUNNING' || run.status === 'PAUSED') {
          setReconnectOffer(run);
        } else {
          localStorage.removeItem(RUN_ID_KEY);
        }
      })
      .catch(() => localStorage.removeItem(RUN_ID_KEY));
  }, []);

  const addLog = (type, msg, qid) => {
    setLog(prev => [...prev, { type, msg, qid, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
  };

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.md')) {
      addLog('error', 'Only .md files are accepted.');
      return;
    }
    abortRef.current = true;
    pausedRef.current = false;
    setRunning(false); setPaused(false); setDone(false); setWaitingForSession(false);
    setProgress(0); setAnswers({}); setErrorCount(0); setOutputMd(''); setElapsed(0);
    setRunId(null);
    localStorage.removeItem(RUN_ID_KEY);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setFileText(text); setFileName(file.name);
      const parsed = parseQuestions(text);
      setQuestions(parsed);
      setLog([{ type: 'info', msg: `Loaded "${file.name}" — found ${parsed.length} question${parsed.length !== 1 ? 's' : ''}.`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
      if (parsed.length === 0) {
        setLog(prev => [...prev, { type: 'warn', msg: 'No questions found. Format must be **Q001.** Your question here', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
      }
      abortRef.current = false;
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleFileInput = (e) => handleFile(e.target.files[0]);

  const getActiveQuestions = useCallback(() => {
    if (questionFilter === 'all') return questions;
    if (questionFilter === 'first') return questions.slice(0, filterFirst);
    if (questionFilter === 'range') return questions.filter((_, i) => i + 1 >= filterFrom && i + 1 <= filterTo);
    return questions;
  }, [questions, questionFilter, filterFirst, filterFrom, filterTo]);

  // ── Backend run CRUD ───────────────────────────────────────────────────────
  const createBackendRun = async (activeQs) => {
    const res = await fetch(`${getClusterAPI()}/api/v1/pipeline/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        clusterId: endpointData.clusterId,
        fileName,
        totalQuestions: activeQs.length,
        questionsJson: JSON.stringify(activeQs),
        systemPrompt,
        outputMode,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to create pipeline run');
    }
    return res.json();
  };

  const checkpointBackend = async (id, answersMap, checkpointIndex, status, errCount) => {
    try {
      await fetch(`${getClusterAPI()}/api/v1/pipeline/runs/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          answersJson: JSON.stringify(answersMap),
          checkpointIndex,
          status,
          errorCount: errCount,
        }),
      });
    } catch (e) {
      addLog('warn', `Checkpoint save failed (continuing anyway): ${e.message}`);
    }
  };

  // ── Cluster status polling (session-boundary awareness) ──────────────────
  const pollUntilClear = async (clusterId) => {
    setWaitingForSession(true);
    addLog('warn', 'Session ended — cluster is running discussion/rotation. Waiting…');
    while (!abortRef.current) {
      try {
        const res = await fetch(`${getClusterAPI()}/api/v1/pipeline/cluster-status?clusterId=${clusterId}`, { headers: authHeaders });
        if (res.ok) {
          const status = await res.json();
          if (!status.isPostProcessing) {
            setWaitingForSession(false);
            addLog('ok', 'Cluster is clear — resuming.');
            return;
          }
        }
      } catch (e) { /* keep polling */ }
      await new Promise(r => setTimeout(r, STATUS_POLL_MS));
    }
    setWaitingForSession(false);
  };

  // ── Ask one question via the real consensus endpoint ──────────────────────
  const askQuestion = async (q, clusterId) => {
    const res = await fetch(`${getClusterAPI()}/api/v1/clusters/consensus/ask`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        clusterId,
        prompt: q.text,
        system_prompt: systemPrompt,
        skipPostSession: false,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  // ── Main run loop ──────────────────────────────────────────────────────────
  const runLoop = async (activeQs, startIndex, id, seedAnswers) => {
    const collected = { ...seedAnswers };
    let errs = errorCount;
    const clusterId = endpointData.clusterId;

    for (let i = startIndex; i < activeQs.length; i++) {
      if (abortRef.current) { addLog('warn', 'Pipeline stopped by user.'); break; }
      while (pausedRef.current && !abortRef.current) {
        await new Promise(r => setTimeout(r, 300));
      }
      if (abortRef.current) break;

      const q = activeQs[i];
      setProgress(i);
      addLog('info', `Sending ${q.qid} (${i + 1}/${activeQs.length})…`, q.qid);

      const questionStart = Date.now();
      try {
        const result = await askQuestion(q, clusterId);

        const winner = result.winner || {};
        collected[q.qid] = {
          winnerModel: winner.model,
          winnerAnswer: winner.answer || '',
          models: result.all_responses || [],
        };
        setAnswers({ ...collected });
        addLog('ok', `${q.qid} ✓ — winner: ${winner.model || '?'} (${Number(winner.avg_score || 0).toFixed(1)})`, q.qid);

        if (result.session_progress != null) {
          setSessionInfo({ progress: result.session_progress, limit: result.session_limit });
        }

        // Checkpoint every CHECKPOINT_EVERY answers
        const answeredCount = Object.keys(collected).length;
        if (answeredCount - lastCheckpointedCountRef.current >= CHECKPOINT_EVERY) {
          await checkpointBackend(id, collected, i, 'RUNNING', errs);
          lastCheckpointedCountRef.current = answeredCount;
          addLog('info', `Checkpoint saved (${answeredCount} answers).`);
        }

        // Session boundary — wait for post-processing before continuing
        if (result.session_ended) {
          await pollUntilClear(clusterId);
          if (abortRef.current) break;
        }
      } catch (e) {
        const msg = e.message || 'Unknown error';
        collected[q.qid] = { error: msg };
        setAnswers({ ...collected });
        errs += 1;
        setErrorCount(errs);
        addLog('error', `${q.qid} failed: ${msg}`, q.qid);
      }

      // Smarter delay — only wait the remainder of MIN_QUESTION_GAP_MS, never a fixed full sleep
      const elapsedThisQ = Date.now() - questionStart;
      const remaining = MIN_QUESTION_GAP_MS - elapsedThisQ;
      if (i < activeQs.length - 1 && remaining > 0) {
        await new Promise(r => setTimeout(r, remaining));
      }
    }

    // Final checkpoint
    await checkpointBackend(id, collected, activeQs.length - 1, abortRef.current ? 'STOPPED' : 'DONE', errs);

    const md = buildOutputMd(activeQs, collected, fileName.replace('.md', ''), outputMode, endpointData?.clusterName);
    setOutputMd(md);
    setProgress(activeQs.length);
    setDone(true); setRunning(false);
    const successCount = Object.keys(collected).length - errs;
    addLog('info', `Done · ${successCount} answered · ${errs} error${errs !== 1 ? 's' : ''}`);
    localStorage.removeItem(RUN_ID_KEY);
  };

  const handleRun = async () => {
    if (running) return;
    const activeQs = getActiveQuestions();
    if (activeQs.length === 0) { addLog('error', 'No questions to run.'); return; }

    const onlineModels = endpointData?.models?.filter(m => m.isOnline) ?? [];
    if (onlineModels.length === 0) {
      addLog('error', 'No models online. Load a model from the cluster dashboard first.');
      return;
    }

    setRunning(true); setPaused(false); setDone(false); setWaitingForSession(false);
    setErrorCount(0); setProgress(0); setAnswers({}); setLog([]); setOutputMd(''); setSessionInfo(null);
    pausedRef.current = false; abortRef.current = false;
    lastCheckpointedCountRef.current = 0;
    setStartTime(Date.now());

    addLog('info', `Starting pipeline · ${activeQs.length} questions · Cluster consensus (${onlineModels.length} model${onlineModels.length !== 1 ? 's' : ''})`);

    try {
      const run = await createBackendRun(activeQs);
      setRunId(run.id);
      localStorage.setItem(RUN_ID_KEY, run.id);
      addLog('info', `Pipeline run #${run.id} created — progress is saved to the backend, safe to navigate away.`);
      await runLoop(activeQs, 0, run.id, {});
    } catch (e) {
      addLog('error', `Failed to start: ${e.message}`);
      setRunning(false);
    }
  };

  // ── Reconnect flow ─────────────────────────────────────────────────────────
  const handleReconnectResume = async () => {
    const run = reconnectOffer;
    setReconnectOffer(null);
    try {
      const parsedQs = JSON.parse(run.questionsJson || '[]');
      const parsedAnswers = JSON.parse(run.answersJson || '{}');
      setQuestions(parsedQs);
      setFileName(run.fileName || 'reconnected.md');
      setSystemPrompt(run.systemPrompt || systemPrompt);
      setOutputMode(run.outputMode || 'WINNER_ONLY');
      setQuestionFilter('all');
      setAnswers(parsedAnswers);
      setErrorCount(run.errorCount || 0);
      setRunId(run.id);
      lastCheckpointedCountRef.current = Object.keys(parsedAnswers).length;

      setRunning(true); setPaused(false); setDone(false);
      pausedRef.current = false; abortRef.current = false;
      setStartTime(Date.now());
      setLog([{ type: 'info', msg: `Reconnected to run #${run.id} — resuming from question ${run.checkpointIndex + 2}/${parsedQs.length}.`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);

      const startIndex = (run.checkpointIndex ?? -1) + 1;
      await runLoop(parsedQs, startIndex, run.id, parsedAnswers);
    } catch (e) {
      addLog('error', `Reconnect failed: ${e.message}`);
      localStorage.removeItem(RUN_ID_KEY);
    }
  };

  const handleReconnectDiscard = async () => {
    const id = reconnectOffer?.id;
    setReconnectOffer(null);
    localStorage.removeItem(RUN_ID_KEY);
    if (id) {
      await checkpointBackend(id, JSON.parse(reconnectOffer.answersJson || '{}'), reconnectOffer.checkpointIndex, 'STOPPED', reconnectOffer.errorCount || 0);
    }
  };

  const handlePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog('warn', pausedRef.current ? 'Paused.' : 'Resumed.');
    if (runId) {
      checkpointBackend(runId, answers, progress - 1, pausedRef.current ? 'PAUSED' : 'RUNNING', errorCount);
    }
  };

  const handleStop = () => {
    abortRef.current = true; pausedRef.current = false;
    setPaused(false); setRunning(false); setDone(true);
  };

  const handleDownload = () => {
    if (!outputMd) return;
    const outName = `${fileName.replace('.md', '')}_cluster_answers.md`;
    const blob = new Blob([outputMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = outName; a.click();
    URL.revokeObjectURL(url);
  };

  const activeQs = getActiveQuestions();
  const pct = activeQs.length > 0 ? Math.round((progress / activeQs.length) * 100) : 0;
  const elapsedStr = elapsed > 0 ? `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s` : '0s';
  const perQ = progress > 0 ? ((elapsed / progress) / 1000).toFixed(1) : '—';
  const onlineModels = endpointData?.models?.filter(m => m.isOnline) ?? [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <style>{`
        /* ── Page layout ── */
        .pl-page { max-width:1180px; margin:0 auto; padding:32px 28px 80px; }
        .pl-grid { display:grid; grid-template-columns:380px 1fr; gap:20px; align-items:start; }

        /* ── Cards ── */
        .pl-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
        .pl-card-head { padding:13px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
        .pl-card-title { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,0.48); font-family:var(--font-mono); }
        .pl-card-body { padding:18px; }

        /* ── Drop zone ── */
        .pl-drop { border:2px dashed var(--border-bright); border-radius:var(--radius-md); padding:32px 20px; text-align:center; cursor:pointer; transition:all var(--transition); background:var(--bg3); }
        .pl-drop:hover, .pl-drop.over { border-color:var(--accent-border); background:var(--accent-dim); }
        .pl-drop.loaded { border-color:var(--accent-border); background:var(--accent-dim); border-style:solid; }
        .pl-drop-icon { font-size:28px; margin-bottom:10px; opacity:.6; }
        .pl-drop-title { font-size:13px; font-weight:500; margin-bottom:5px; }
        .pl-drop-sub { font-size:11px; color:var(--text-mid); line-height:1.5; }
        .pl-file-pill { display:inline-flex; align-items:center; gap:8px; background:var(--accent-dim); border:1px solid var(--accent-border); border-radius:20px; padding:4px 12px; font-size:11px; color:var(--accent); font-family:var(--font-mono); margin-top:10px; }

        /* ── Output mode selector ── */
        .pl-mode-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .pl-mode-card { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px 14px; cursor:pointer; transition:all var(--transition); position:relative; }
        .pl-mode-card:hover { border-color:var(--border-bright); }
        .pl-mode-card.active { border-color:var(--accent-border); background:var(--accent-dim); }
        .pl-mode-card.active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent); border-radius:2px 0 0 2px; }
        .pl-mode-label { font-size:12px; font-weight:600; margin-bottom:3px; }
        .pl-mode-sub { font-size:10px; color:var(--text-mid); line-height:1.4; }

        /* ── Model list ── */
        .pl-model-list { display:flex; flex-direction:column; gap:5px; }
        .pl-model-item { display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg3); }
        .pl-model-item.offline { opacity:.45; }
        .pl-model-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .pl-model-name { font-size:11px; font-weight:500; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pl-model-badge { font-size:9px; font-family:var(--font-mono); padding:2px 6px; border-radius:var(--radius-sm); border:1px solid; flex-shrink:0; }
        .pl-badge-gpu { color:var(--accent); border-color:var(--accent-border); background:var(--accent-dim); }
        .pl-badge-cpu { color:var(--yellow); border-color:rgba(245,158,11,0.25); background:var(--yellow-dim); }
        .pl-badge-off { color:var(--red); border-color:rgba(239,68,68,0.25); background:var(--red-dim); }

        /* ── Inputs ── */
        .pl-label { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-mid); font-family:var(--font-mono); display:block; margin-bottom:6px; }
        .pl-row { display:flex; gap:10px; align-items:flex-end; }
        .pl-field { display:flex; flex-direction:column; gap:5px; }

        /* ── Buttons ── */
        .pl-run-btn { padding:11px 24px; background:var(--text); color:#000; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:opacity var(--transition); display:flex; align-items:center; gap:8px; width:100%; justify-content:center; font-family:var(--font-sans); }
        .pl-run-btn:hover { opacity:.88; }
        .pl-run-btn:disabled { opacity:.35; cursor:not-allowed; }
        .pl-dl-btn { padding:11px 24px; background:var(--accent); color:#000; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:opacity var(--transition); display:flex; align-items:center; gap:8px; width:100%; justify-content:center; font-family:var(--font-sans); }
        .pl-dl-btn:hover { opacity:.85; }

        /* ── Progress ── */
        .pl-prog-bar { height:3px; background:var(--border); border-radius:2px; overflow:hidden; }
        .pl-prog-fill { height:100%; border-radius:2px; background:var(--accent); transition:width .3s ease; }
        .pl-prog-fill.waiting { background:var(--yellow); }
        .pl-stats-row { display:flex; gap:20px; flex-wrap:wrap; }
        .pl-stat label { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-mid); font-family:var(--font-mono); margin-bottom:3px; }
        .pl-stat value { font-family:var(--font-mono); font-size:17px; font-weight:600; }

        /* ── Log ── */
        .pl-log { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); height:280px; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:4px; font-family:var(--font-mono); font-size:11px; }
        .pl-log-entry { display:flex; gap:8px; line-height:1.5; }
        .pl-log-time { color:rgba(255,255,255,0.32); flex-shrink:0; }
        .pl-log-msg.info { color:var(--text-mid); }
        .pl-log-msg.ok { color:var(--accent); }
        .pl-log-msg.warn { color:var(--yellow); }
        .pl-log-msg.error { color:var(--red); }
        .pl-log-qid { color:var(--accent); margin-right:4px; opacity:.7; }

        /* ── Answer preview ── */
        .pl-answer-preview { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); max-height:320px; overflow-y:auto; }
        .pl-answer-row { padding:10px 14px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:flex-start; }
        .pl-answer-row:last-child { border-bottom:none; }
        .pl-answer-qid { font-family:var(--font-mono); font-size:10px; color:var(--accent); flex-shrink:0; padding-top:2px; min-width:36px; }
        .pl-answer-text { font-size:12px; color:var(--text-mid); line-height:1.6; }
        .pl-answer-meta { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); margin-bottom:3px; }

        /* ── Format guide ── */
        .pl-format-box { background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-md); padding:14px 16px; font-family:var(--font-mono); font-size:11px; color:var(--text-mid); line-height:1.8; white-space:pre; overflow-x:auto; }

        /* ── Callout ── */
        .pl-callout { padding:11px 14px; border-radius:var(--radius-md); font-size:12px; line-height:1.6; display:flex; gap:9px; align-items:flex-start; }
        .pl-callout.info { background:var(--accent-dim); border:1px solid var(--accent-border); color:var(--text-mid); }
        .pl-callout.warn { background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.22); color:rgba(245,158,11,0.85); }
        .pl-callout.err { background:var(--red-dim); border:1px solid rgba(239,68,68,0.25); color:var(--red); }

        /* ── Header ── */
        .pl-header { margin-bottom:28px; }
        .pl-header h1 { font-size:22px; font-weight:600; letter-spacing:-.02em; margin-bottom:6px; }
        .pl-header p { font-size:13px; color:var(--text-mid); line-height:1.5; }

        .pl-divider { height:1px; background:var(--border); margin:16px 0; }

        /* ── Reconnect modal ── */
        .pl-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:100; }
        .pl-modal { background:var(--bg2); border:1px solid var(--border-bright); border-radius:var(--radius-lg); padding:24px; max-width:420px; width:90%; }
        .pl-modal h3 { font-size:15px; font-weight:600; margin-bottom:10px; }
        .pl-modal p { font-size:13px; color:var(--text-mid); line-height:1.6; margin-bottom:18px; }

        .spin { display:inline-block; animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:'var(--nav-height)', borderBottom:'1px solid var(--border)', background:'var(--bg)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div className="nd-logo" onClick={() => navigate('/dashboard')} style={{ cursor:'pointer' }}>
            <div className="nd-logo-mark"><span /><span /><span /><span /></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            <button style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }} onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }} onClick={() => navigate(`/cluster?id=${clusterIdParam || ''}`)}>Cluster</button>
            <button style={{ background:'var(--accent-dim)', border:'none', fontSize:12, fontWeight:500, color:'var(--accent)', cursor:'default', padding:'5px 9px', borderRadius:6 }}>Pipeline</button>
            <button style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }} onClick={() => navigate(`/api-hosting?id=${clusterIdParam || ''}`)}>API</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="nd-back-btn" onClick={() => navigate(`/cluster?id=${clusterIdParam || ''}`)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width:12, height:12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Cluster
          </button>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
          </div>
          <div className="nd-avatar">{avatarInitials}</div>
        </div>
      </nav>

      {/* ── Reconnect offer modal ── */}
      {reconnectOffer && (
        <div className="pl-modal-backdrop">
          <div className="pl-modal">
            <h3>Resume pipeline run?</h3>
            <p>
              Run #{reconnectOffer.id} ({reconnectOffer.fileName}) was left {reconnectOffer.status === 'PAUSED' ? 'paused' : 'in progress'} at question {(reconnectOffer.checkpointIndex ?? -1) + 1}/{reconnectOffer.totalQuestions}.
              The backend kept processing — your answers so far are safe.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="pl-run-btn" onClick={handleReconnectResume}>Resume</button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={handleReconnectDiscard}>Discard</button>
            </div>
          </div>
        </div>
      )}

      <div className="pl-page">

        {/* ── Header ── */}
        <div className="pl-header">
          <h1>Batch Pipeline</h1>
          <p>
            Drop a <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 12 }}>.md</code> file of questions and the pipeline will feed each one through your cluster's real consensus flow — counting toward the session, waiting out discussion and rotation, and checkpointing to the backend so you can navigate away safely.
            {endpointData && <span> · Cluster: <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{endpointData.clusterName}</span></span>}
          </p>
        </div>

        {endpointError && (
          <div className="pl-callout err" style={{ marginBottom: 20 }}>

            <span>{endpointError === 'Only the cluster host can access API endpoints' ? 'Only the cluster host can run the pipeline.' : endpointError}</span>
          </div>
        )}

        <div className="pl-grid">

          {/* ── LEFT: config panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* File drop */}
            <div className="pl-card">
              <div className="pl-card-head"><span className="pl-card-title">Questions File</span></div>
              <div className="pl-card-body">
                <div
                  className={`pl-drop ${dragOver ? 'over' : ''} ${questions.length > 0 ? 'loaded' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => !running && fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".md" style={{ display: 'none' }} onChange={handleFileInput} />
                  <div className="pl-drop-icon" style={{ fontSize:22, opacity: questions.length > 0 ? 1 : 0.6 }}>
                    {questions.length > 0
                      ? <svg viewBox="0 0 20 20" fill="none" style={{ width:28, height:28 }}><path d="M4 10l5 5L16 5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg viewBox="0 0 20 20" fill="none" style={{ width:28, height:28 }}><path d="M4 4h8l4 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M12 4v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    }
                  </div>
                  <div className="pl-drop-title">
                    {questions.length > 0 ? `${questions.length} questions ready` : 'Drop your questions.md here'}
                  </div>
                  <div className="pl-drop-sub">
                    {questions.length > 0
                      ? <span className="pl-file-pill">{fileName}</span>
                      : 'or click to browse · .md files only'
                    }
                  </div>
                </div>

                <div className="pl-divider" />

                <div style={{ marginBottom: 10 }}>
                  <span className="pl-label">Required Format</span>
                  <div className="pl-format-box">{`**Q001.** What is the capital of France?

**Q002.** Explain photosynthesis in simple terms.

**Q003.** Write a haiku about machine learning.`}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
                    Zero-padded 3-digit IDs · one question per <code>**Q###.**</code> block
                  </div>
                </div>
              </div>
            </div>

            {/* Cluster info + output mode */}
            <div className="pl-card">
              <div className="pl-card-head">
                <span className="pl-card-title">Cluster Consensus</span>
                <span className="badge badge-accent">counts toward session</span>
              </div>
              <div className="pl-card-body">

                {loadingEndpoints ? (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>
                    <span className="spin">⟳</span> Loading models…
                  </div>
                ) : (
                  <>
                    <div className="pl-callout info" style={{ marginBottom: 14 }}>

                      <span>
                        {onlineModels.length > 0
                          ? <><strong style={{ color: 'var(--text)' }}>{onlineModels.length} model{onlineModels.length !== 1 ? 's' : ''}</strong> online. Every question runs the full generate → vote → score cycle and counts toward the session ({endpointData?.sessionAnswers ?? 0}/{endpointData?.sessionLimit ?? '?'} currently).</>
                          : 'No models online. Load models from the cluster dashboard first.'
                        }
                      </span>
                    </div>

                    <div className="pl-model-list">
                      {endpointData?.models?.map((m, i) => (
                        <div key={m.modelId} className={`pl-model-item ${!m.isOnline ? 'offline' : ''}`}>
                          <div className="pl-model-dot" style={{
                            background: MODEL_COLORS[i % MODEL_COLORS.length],
                            boxShadow: m.isOnline ? `0 0 4px ${MODEL_COLORS[i % MODEL_COLORS.length]}66` : 'none'
                          }} />
                          <span className="pl-model-name">{m.modelName}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{m.nodeName}</span>
                          {!m.isOnline
                            ? <span className="pl-model-badge pl-badge-off">Offline</span>
                            : m.gpuLayers > 0
                              ? <span className="pl-model-badge pl-badge-gpu">GPU</span>
                              : <span className="pl-model-badge pl-badge-cpu">CPU</span>
                          }
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="pl-divider" />

                <span className="pl-label">Output File Contents</span>
                <div className="pl-mode-grid">
                  <div className={`pl-mode-card ${outputMode === 'WINNER_ONLY' ? 'active' : ''}`} onClick={() => !running && setOutputMode('WINNER_ONLY')}>
                    <div className="pl-mode-label" style={{ color: outputMode === 'WINNER_ONLY' ? 'var(--accent)' : 'var(--text)' }}>Winner Only</div>
                    <div className="pl-mode-sub">Just the best answer per question. Smaller, cleaner file.</div>
                  </div>
                  <div className={`pl-mode-card ${outputMode === 'ALL_MODELS' ? 'active' : ''}`} onClick={() => !running && setOutputMode('ALL_MODELS')}>
                    <div className="pl-mode-label" style={{ color: outputMode === 'ALL_MODELS' ? 'var(--accent)' : 'var(--text)' }}>All Models</div>
                    <div className="pl-mode-sub">Every model's answer + scores per question, plus a leaderboard.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced config */}
            <div className="pl-card">
              <div className="pl-card-head"><span className="pl-card-title">Configuration</span></div>
              <div className="pl-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div className="pl-field">
                  <label className="pl-label">System Prompt</label>
                  <textarea className="nd-textarea" style={{ minHeight: 72, fontSize: 12 }} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} disabled={running} />
                </div>

                <div className="pl-field">
                  <label className="pl-label">Question Filter</label>
                  <select className="nd-select" style={{ width: '100%' }} value={questionFilter} onChange={e => setQuestionFilter(e.target.value)} disabled={running}>
                    <option value="all">All questions ({questions.length})</option>
                    <option value="first">First N questions</option>
                    <option value="range">Question range (by index)</option>
                  </select>
                </div>

                {questionFilter === 'first' && (
                  <div className="pl-field">
                    <label className="pl-label">First N questions</label>
                    <input className="nd-input" type="number" min="1" max={questions.length || 999} value={filterFirst} onChange={e => setFilterFirst(Number(e.target.value))} disabled={running} />
                  </div>
                )}

                {questionFilter === 'range' && (
                  <div className="pl-row">
                    <div className="pl-field" style={{ flex: 1 }}>
                      <label className="pl-label">From (index)</label>
                      <input className="nd-input" type="number" min="1" value={filterFrom} onChange={e => setFilterFrom(Number(e.target.value))} disabled={running} />
                    </div>
                    <div className="pl-field" style={{ flex: 1 }}>
                      <label className="pl-label">To (index)</label>
                      <input className="nd-input" type="number" min="1" value={filterTo} onChange={e => setFilterTo(Number(e.target.value))} disabled={running} />
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  Ready: <strong style={{ color: 'var(--accent)' }}>{activeQs.length}</strong> question{activeQs.length !== 1 ? 's' : ''} will be sent · checkpoints every {CHECKPOINT_EVERY}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: run panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Run controls */}
            <div className="pl-card">
              <div className="pl-card-head">
                <span className="pl-card-title">
                  {done ? 'Complete' : waitingForSession ? 'Waiting on session' : running ? (paused ? 'Paused' : 'Running') : 'Ready'}
                </span>
                {running && !done && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {progress}/{activeQs.length} · {elapsedStr} · ~{perQ}s/q
                  </span>
                )}
              </div>
              <div className="pl-card-body">

                {waitingForSession && (
                  <div className="pl-callout warn" style={{ marginBottom: 14 }}>
                    <span className="spin">⟳</span>
                    <span>Session ended — cluster is running discussion/rotation in the background. The pipeline will resume automatically once it's clear.</span>
                  </div>
                )}

                {sessionInfo && !waitingForSession && running && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>
                    Session: {sessionInfo.progress}/{sessionInfo.limit}
                  </div>
                )}

                <div className="pl-prog-bar" style={{ marginBottom: 16 }}>
                  <div className={`pl-prog-fill ${waitingForSession ? 'waiting' : ''}`} style={{ width: `${pct}%` }} />
                </div>

                <div className="pl-stats-row" style={{ marginBottom: 20 }}>
                  <div className="pl-stat">
                    <label>Progress</label>
                    <value style={{ color: 'var(--accent)' }}>{pct}%</value>
                  </div>
                  <div className="pl-stat">
                    <label>Answered</label>
                    <value style={{ color: 'var(--accent)' }}>{Object.keys(answers).length - errorCount}</value>
                  </div>
                  <div className="pl-stat">
                    <label>Errors</label>
                    <value style={{ color: errorCount > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{errorCount}</value>
                  </div>
                  <div className="pl-stat">
                    <label>Elapsed</label>
                    <value style={{ color: 'var(--text-mid)', fontSize: 14 }}>{elapsedStr}</value>
                  </div>
                </div>

                {!running && !done && (
                  <button
                    className="pl-run-btn"
                    onClick={handleRun}
                    disabled={questions.length === 0 || loadingEndpoints || !!endpointError}
                  >
                    <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14 }}>
                      <path d="M3 2l9 5-9 5V2z" fill="currentColor" />
                    </svg>
                    Run Pipeline
                  </button>
                )}

                {running && !done && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-ghost" onClick={handlePause} style={{ flex: 1 }} disabled={waitingForSession}>
                      {paused
                        ? <><svg viewBox="0 0 14 14" fill="none" style={{ width: 13, height: 13 }}><path d="M3 2l9 5-9 5V2z" fill="currentColor" /></svg> Resume</>
                        : <><svg viewBox="0 0 14 14" fill="none" style={{ width: 13, height: 13 }}><rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg> Pause</>
                      }
                    </button>
                    <button className="btn btn-danger" onClick={handleStop} style={{ flex: 1 }}>
                      <svg viewBox="0 0 14 14" fill="none" style={{ width: 13, height: 13 }}>
                        <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
                      </svg>
                      Stop
                    </button>
                  </div>
                )}

                {running && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 12, textAlign: 'center' }}>
                    Run #{runId} · safe to navigate away — progress is saved to the backend
                  </div>
                )}

                {done && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="pl-dl-btn" onClick={handleDownload}>
                      <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14 }}>
                        <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Download Answers
                    </button>
                    <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                      abortRef.current = false; pausedRef.current = false;
                      setDone(false); setRunning(false); setPaused(false); setWaitingForSession(false);
                      setProgress(0); setAnswers({}); setLog([]); setSessionInfo(null);
                      setErrorCount(0); setOutputMd(''); setElapsed(0); setRunId(null);
                      setFileName(''); setFileText(''); setQuestions([]);
                      localStorage.removeItem(RUN_ID_KEY);
                    }}>
                      Reset · Run Again
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live log */}
            <div className="pl-card">
              <div className="pl-card-head">
                <span className="pl-card-title">Live Log</span>
                <button onClick={() => setLog([])} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>clear</button>
              </div>
              <div style={{ padding: '12px' }}>
                <div className="pl-log" ref={logRef}>
                  {log.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', textAlign: 'center', paddingTop: 8 }}>
                      Drop a file and hit Run Pipeline to start.
                    </div>
                  ) : (
                    log.map((entry, i) => (
                      <div key={i} className="pl-log-entry">
                        <span className="pl-log-time">{entry.time}</span>
                        <span className={`pl-log-msg ${entry.type}`}>
                          {entry.qid && <span className="pl-log-qid">{entry.qid}</span>}
                          {entry.msg}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Answer preview */}
            {Object.keys(answers).length > 0 && (
              <div className="pl-card">
                <div className="pl-card-head">
                  <span className="pl-card-title">Answers ({Object.keys(answers).length})</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>live preview</span>
                </div>
                <div className="pl-answer-preview">
                  {Object.keys(answers).sort().map(qid => {
                    const a = answers[qid];
                    if (a.error) {
                      return (
                        <div key={qid} className="pl-answer-row">
                          <span className="pl-answer-qid">{qid}</span>
                          <span className="pl-answer-text" style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>(error: {a.error})</span>
                        </div>
                      );
                    }
                    const text = a.winnerAnswer || '';
                    return (
                      <div key={qid} className="pl-answer-row">
                        <span className="pl-answer-qid">{qid}</span>
                        <div>
                          <div className="pl-answer-meta">winner: {a.winnerModel || '?'}{Array.isArray(a.models) ? ` · ${a.models.length} model${a.models.length !== 1 ? 's' : ''} voted` : ''}</div>
                          <span className="pl-answer-text">{text.slice(0, 180)}{text.length > 180 ? '…' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Output file preview */}
            {done && outputMd && (
              <div className="pl-card">
                <div className="pl-card-head">
                  <span className="pl-card-title">Output File Preview</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(outputMd)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                  >
                    copy all
                  </button>
                </div>
                <div style={{ padding: 12 }}>
                  <pre style={{ margin: 0, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7, maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                    {outputMd.slice(0, 1200)}{outputMd.length > 1200 ? '\n\n[… truncated — download for full file]' : ''}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}