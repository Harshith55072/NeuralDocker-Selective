import asyncio
import gc
import os
import sys
import threading
import time
import json
import platform
import random
import re
from typing import Optional, List, Dict, Callable
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import httpx
from contextlib import asynccontextmanager

# Try to import llama-cpp-python
try:
    from llama_cpp import Llama, llama_supports_gpu_offload
    _GPU_OFFLOAD = llama_supports_gpu_offload()
    print(f"llama-cpp-python loaded. GPU offload supported: {_GPU_OFFLOAD}")
except ImportError:
    print("WARNING: llama-cpp-python is not installed. Running in simulation mode.")
    Llama = None
    _GPU_OFFLOAD = False

# ── VRAM probe ────────────────────────────────────────────────────────────────
try:
    import pynvml
    pynvml.nvmlInit()
    _NVML_OK = True
except Exception:
    _NVML_OK = False

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

CTX_SIZE          = 4096 
MAX_TOKENS        = 512 
DISCUSSION_TOKENS = 256  # Shorter responses for discussion — saves context space 
TEMPERATURE       = 0.7 
MONITOR_URL       = os.getenv("MONITOR_URL", "http://system-monitor:8001") 
 
# Character budget for the discussion prompt, post chat-template formatting.
# n_ctx=512, DISCUSSION_TOKENS=256 reserved for the response → ~256 tokens left
# for the prompt itself. At a conservative ~3.5 chars/token that's ~900 chars —
# previously this constant was set to 2000 (would overflow n_ctx=512 on its own,
# before even adding the response budget) AND was never actually used anywhere
# in the code, so it enforced nothing. Now wired into both truncation points in
# the discussion path (see consensus_discuss and _discuss_on_cpu below).
MAX_DISCUSSION_PROMPT_CHARS = 900 

# Default models directory — always use Docker volume mount
MODELS_DIR = os.getenv("MODELS_DIR", "/models")


# ─────────────────────────────────────────────────────────────────────────────
# Prompt formatters — dynamic detection based on keywords
# ─────────────────────────────────────────────────────────────────────────────

FORMATTERS = {
    "chatml":   ("chatml", "phi", "mistral", "qwen", "deepseek", "gemma"),
    "llama3":   ("llama-3", "llama3"),
    "hermes":   ("nous", "hermes", "openhermes")
}

def detect_formatter(path: str) -> Callable:
    """Detect prompt format from GGUF filename without hardcoded model logic."""
    name = os.path.basename(path).lower()

    # ChatML / instruction-tuned models
    if any(k in name for k in FORMATTERS["chatml"]):
        def chatml_fmt(hist, p, sys_p):
            out = f"<|im_start|>system\n{sys_p}<|im_end|>\n"
            for m in hist:
                out += (
                    f"<|im_start|>user\n{m['content']}<|im_end|>\n"
                    if m["role"] == "user"
                    else f"<|im_start|>assistant\n{m['content']}<|im_end|>\n"
                )
            return out + f"<|im_start|>user\n{p}<|im_end|>\n<|im_start|>assistant\n"
        return chatml_fmt

    # Llama-3 / Meta header format
    if any(k in name for k in FORMATTERS["llama3"]):
        def llama3_fmt(hist, p, sys_p):
            # No leading <|begin_of_text|> here — llama-cpp-python's Llama.__call__
            # already auto-prepends the real BOS token when tokenizing (add_bos=True
            # is the default). Including it here as literal text used to get
            # tokenized as a SECOND BOS token on top of that, which llama.cpp
            # itself warned about at runtime: "Detected duplicate leading
            # <|begin_of_text|> in prompt, this will likely reduce response
            # quality" — confirmed happening live before this fix, on every
            # Llama-3-family model's main answers (this formatter is shared by
            # ask()/rate()/discussion, not just one code path).
            out = f"<|start_header_id|>system<|end_header_id|>\n\n{sys_p}<|eot_id|>"
            for m in hist:
                out += (
                    f"<|start_header_id|>user<|end_header_id|>\n\n{m['content']}<|eot_id|>"
                    if m["role"] == "user"
                    else f"<|start_header_id|>assistant<|end_header_id|>\n\n{m['content']}<|eot_id|>"
                )
            return out + f"<|start_header_id|>user<|end_header_id|>\n\n{p}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        return llama3_fmt

    # Hermes style
    if any(k in name for k in FORMATTERS["hermes"]):
        return lambda hist, p, sys_p: format_nous(hist, p, sys_p)

    # Generic plain-text fallback
    def generic_fmt(hist, p, sys_p):
        out = f"{sys_p}\n\n"
        for m in hist:
            out += (
                f"User: {m['content']}\n"
                if m["role"] == "user"
                else f"Assistant: {m['content']}\n"
            )
        return out + f"User: {p}\nAssistant: "
    return generic_fmt


# ─────────────────────────────────────────────────────────────────────────────
# GGUF metadata helper
# ─────────────────────────────────────────────────────────────────────────────

def _read_gguf_string(f) -> str:
    length = int.from_bytes(f.read(8), "little")
    return f.read(length).decode(errors="ignore")


def _skip_gguf_value(f, val_type: int):
    """Skip a GGUF metadata value by type tag."""
    if val_type in (0, 1, 7):
        f.read(1)
    elif val_type in (2, 3):
        f.read(2)
    elif val_type in (4, 5, 6):
        f.read(4)
    elif val_type in (10, 11, 12):
        f.read(8)
    elif val_type == 8:
        _read_gguf_string(f)
    elif val_type == 9:
        sub_type = int.from_bytes(f.read(4), "little")
        count    = int.from_bytes(f.read(8), "little")
        for _ in range(count):
            _skip_gguf_value(f, sub_type)


def read_gguf_layer_count(path: str) -> Optional[int]:
    """Read GGUF metadata to find the model's block/layer count."""
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
            if magic != b"GGUF":
                return None
            _version  = int.from_bytes(f.read(4), "little")
            n_tensors = int.from_bytes(f.read(8), "little")
            n_kv      = int.from_bytes(f.read(8), "little")

            for _ in range(n_kv):
                key      = _read_gguf_string(f)
                val_type = int.from_bytes(f.read(4), "little")

                # Match any architecture's block_count key
                if key.endswith(".block_count"):
                    if val_type == 4:  # UINT32
                        return int.from_bytes(f.read(4), "little")

                _skip_gguf_value(f, val_type)

            return max(1, n_tensors // 9)
    except Exception as e:
        print(f"Error reading GGUF metadata from {path}: {e}")
        return None


def get_vram_info():
    global _NVML_OK
    if not _NVML_OK:
        # Try to re-init NVML in case GPU became available after container start
        try:
            pynvml.nvmlInit()
            _NVML_OK = True
            print("NVML re-initialized successfully")
        except Exception:
            return None, None, None
    if _NVML_OK:
        try:
            h    = pynvml.nvmlDeviceGetHandleByIndex(0)
            info = pynvml.nvmlDeviceGetMemoryInfo(h)
            tot  = info.total // (1024 * 1024)
            free = info.free  // (1024 * 1024)
            return tot, tot - free, free
        except Exception:
            pass
    return None, None, None


def calc_gpu_layers(path: str, vram_budget_mb: int) -> int:
    # KV cache grows with context size and is often 500MB-1.5GB 
    # Formula: base(512) + per-1k-context(128MB) is more realistic than 64MB 
    kv_cache_mb = (CTX_SIZE // 1024) * 128 
    overhead = 512 + kv_cache_mb  # ~1024MB total — more realistic CUDA runtime overhead 
    if not os.path.exists(path):
        return 0
    try:
        file_stats = os.stat(path)
        file_mb  = file_stats.st_size / (1024 * 1024)
        n_layers = read_gguf_layer_count(path) or 32
        
        # Estimate VRAM per layer (rough heuristic)
        # Weights take up most of the space.
        mb_per_l = max(file_mb / n_layers, 0.1)
        
        # Available budget after overhead
        available = max(0, vram_budget_mb - overhead)
        
        layers = int(available / mb_per_l)
        return min(max(0, layers), n_layers)
    except Exception as e:
        print(f"Error calculating GPU layers: {e}")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Setup
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(base_url=MONITOR_URL, timeout=10.0)
    yield
    await app.state.client.aclose()


app = FastAPI(title="Consensus Gateway", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = "You are a helpful AI assistant."
    # Cluster-level "Max Tokens" / "Temperature" settings — previously stored in the
    # Cluster entity but never actually sent to the model. Optional so older callers
    # (discussion endpoint, direct testing) keep working with the module defaults.
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class RateRequest(BaseModel):
    prompt: str
    answers: List[Dict[str, str]]
    system_prompt: Optional[str] = "You are an expert evaluator."


class ModelLoadRequest(BaseModel):
    path: str
    name: str


# Global lock to prevent simultaneous model loading which causes VRAM spikes
loading_lock = threading.RLock()
# True while a model load is in progress — used to queue concurrent load requests
_model_loading_in_progress = False

# ─────────────────────────────────────────────────────────────────────────────
# ConsensusModel
# ─────────────────────────────────────────────────────────────────────────────

class ConsensusModel:
    def __init__(self, path: str, name: str):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model file not found: {path}")
        self.path = path
        self.name = name
        self.score = 1000.0
        self.wins = 0
        self.losses = 0
        self.votes = 0
        self.llm = None
        # Separate, cached CPU instance used only for post-session discussion
        # (see _discuss_on_cpu) — kept distinct from self.llm because discussion
        # deliberately runs on CPU with a small context even when the main model
        # is GPU-loaded, to avoid doubling VRAM usage. Lazily created on first
        # use, then reused across every discussion round instead of reloading
        # the GGUF file from disk each time.
        self.discuss_llm = None

        # Defer GPU layer calculation to load() so VRAM is probed
        # at the actual moment of loading, not at object creation
        self.gpu_layers = 0  # will be recalculated in load()

        self.formatter = detect_formatter(path)

    def load(self):
        if self.llm is not None or Llama is None:
            return
        
        with loading_lock:
            if self.llm is not None:
                return

        # Llama() initialization happens OUTSIDE the lock 
        # It is slow (can take minutes on CPU fallback) and should not block other reads 
        try:
            # Recalculate GPU layers here — VRAM state is accurate right now
            if not _GPU_OFFLOAD:
                self.gpu_layers = 0
                print(f"GPU offload not supported — loading {self.name} on CPU")
            elif _NVML_OK:
                _, _, free = get_vram_info()
                budget = int(free * 0.85) if (free and free > 0) else 0
                self.gpu_layers = calc_gpu_layers(self.path, budget)
                print(f"VRAM at load time for {self.name}: {free}MB free → {self.gpu_layers} GPU layers")
            else:
                self.gpu_layers = 0
                print(f"NVML unavailable — loading {self.name} on CPU")

            print(f"Initializing {self.name} with {self.gpu_layers} GPU layers...")
            llm_instance = Llama(
                model_path=self.path,
                n_gpu_layers=self.gpu_layers,
                n_ctx=CTX_SIZE,
                verbose=False,
            )
            # Re-acquire lock only to assign the result
            with loading_lock:
                if self.llm is None:  # Check again in case of race
                    self.llm =  llm_instance
                else:
                    # Another thread loaded it while we were waiting, discard ours
                    del  llm_instance
                    gc.collect()
        except Exception as e:
            print(f"Failed to load model {self.name}: {e}")
            raise RuntimeError(f"Model loading failed: {str(e)}")

    def unload(self):
        """Properly release the LLM from memory."""
        if self.llm is not None:
            # Explicitly delete and collect to free VRAM/RAM
            try:
                # Some versions of llama-cpp-python benefit from explicit deletion
                del self.llm
            except Exception as e:
                print(f"Error during del self.llm: {e}")
            
            self.llm = None
            gc.collect()
            
            # If using CUDA, try to empty cache if torch is present
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

        if self.discuss_llm is not None:
            try:
                del self.discuss_llm
            except Exception as e:
                print(f"Error during del self.discuss_llm: {e}")
            self.discuss_llm = None
            gc.collect()

    def ask(self, prompt: str, system_prompt: str, max_tokens: int = MAX_TOKENS, temperature: float = TEMPERATURE) -> str: 
        if Llama is None: 
            # Simulation mode: return a plausible fake answer for testing 
            return ( 
                f"[{self.name}] This is a simulated response. " 
                "Install llama-cpp-python for real inference." 
            ) 
        try: 
            self.load() 
        except RuntimeError as e: 
            return f"Error loading {self.name}: {e}" 
        if self.llm is None: 
            return f"Error: Model {self.name} could not be loaded." 
        try: 
            # Aggressive truncation — leave plenty of room for response 
            # CTX_SIZE=4096, each token ~4 chars, leave 2x buffer 
            max_prompt_chars = max(500, (CTX_SIZE - max_tokens - 512) * 3) 
            if len(prompt) > max_prompt_chars: 
                prompt = prompt[:max_prompt_chars] + "\n[truncated]" 
                print(f"Warning: prompt truncated to {max_prompt_chars} chars for {self.name}") 
 
            full_prompt = self.formatter([], prompt, system_prompt) 
 
            # Check token count estimate before running — prevent OOM 
            estimated_tokens = len(full_prompt) // 3 
            if estimated_tokens > CTX_SIZE - max_tokens: 
                print(f"Warning: estimated {estimated_tokens} tokens exceeds safe limit for {self.name}, truncating further") 
                safe_chars = (CTX_SIZE - max_tokens - 100) * 3 
                full_prompt = full_prompt[:safe_chars] 
 
            out = self.llm( 
                full_prompt, 
                max_tokens=max_tokens, 
                temperature=TEMPERATURE, 
                stop=["<|im_end|>", "</s>", "<|eot_id|>"], 
            ) 
            result = out["choices"][0]["text"].strip() 
 
            # Reset CUDA memory fragmentation after each inference 
            # This prevents degradation that causes CUDA errors on the 10th+ call 
            try: 
                import torch 
                if torch.cuda.is_available(): 
                    torch.cuda.empty_cache() 
            except ImportError: 
                pass 
 
            return result 
 
        except MemoryError as e: 
            # OOM — unload this model to free memory, don't crash the service 
            print(f"OOM error for {self.name} — unloading to free memory: {e}") 
            try: 
                self.unload() 
            except Exception: 
                pass 
            return f"[{self.name}] Out of memory — model unloaded." 
 
        except Exception as e: 
            err_str = str(e).lower() 
            # Catch llama.cpp internal OOM errors which come as RuntimeError 
            if any(x in err_str for x in ['out of memory', 'ggml', 'cuda error', 'failed to allocate']): 
                print(f"CUDA/memory error for {self.name}: {e} — unloading model") 
                try: 
                    self.unload() 
                except Exception: 
                    pass 
                return f"[{self.name}] Memory error — model unloaded." 
            print(f"Generation error for {self.name}: {str(e)}") 
            return f"Error during generation for {self.name}: {str(e)}" 

    def rate(self, prompt: str, answer_to_rate: str, answering_model: str) -> int:
        """Rate an answer on a scale of 1–5. Returns 3 on any error."""
        if Llama is None:
            return random.randint(2, 5)
        try:
            self.load()
        except RuntimeError:
            return 3
        if self.llm is None:
            return 3
        try:
            eval_prompt = (
                f'You are evaluating answers to this question:\n"{prompt}"\n\n'
                f'Answer to evaluate:\n"{answer_to_rate}"\n\n'
                "Rate the accuracy and quality of this answer on a scale of 1 to 5:\n"
                "5 = Excellent, accurate and complete\n"
                "4 = Good, mostly accurate\n"
                "3 = Average, partially correct\n"
                "2 = Poor, mostly inaccurate\n"
                "1 = Wrong or completely off-topic\n\n"
                "Respond with ONLY a single digit (1, 2, 3, 4, or 5). No other text."
            )
            full_prompt = self.formatter([], eval_prompt, "You are a strict and impartial evaluator.")
            out  = self.llm(full_prompt, max_tokens=5, temperature=0.1)
            text = out["choices"][0]["text"].strip()
            match = re.search(r"[1-5]", text)
            if match:
                return int(match.group())
        except Exception as e:
            print(f"Rating error for {self.name}: {e}")
        return 3


# ─────────────────────────────────────────────────────────────────────────────
# Active model registry
# ─────────────────────────────────────────────────────────────────────────────

active_models: List[ConsensusModel] = []


# ─────────────────────────────────────────────────────────────────────────────
# Consensus routes
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/consensus/generate")
async def consensus_generate(req: PromptRequest):
    """Ask all loaded models — return answers as they finish, don't wait for stragglers."""
    if not active_models:
        raise HTTPException(
            status_code=400,
            detail="No models loaded. Load at least one model before sending prompts."
        )

    # Per-model timeout: 150s is enough for GPU; CPU models get cut off rather than blocking all
    PER_MODEL_TIMEOUT = 150

    async def _ask_with_timeout(m: ConsensusModel) -> Optional[Dict]:
        try:
            answer = await asyncio.wait_for(
                asyncio.to_thread(m.ask, req.prompt, req.system_prompt),
                timeout=PER_MODEL_TIMEOUT
            )
            return {"model": m.name, "answer": answer, "path": m.path}
        except asyncio.TimeoutError:
            print(f"Model {m.name} timed out after {PER_MODEL_TIMEOUT}s — skipping")
            return None
        except Exception as e:
            print(f"Model {m.name} error: {e}")
            return None

    tasks = [_ask_with_timeout(m) for m in active_models]
    results = await asyncio.gather(*tasks)
    # Filter out timed-out / errored models
    return [r for r in results if r is not None] 
 
@app.post("/api/consensus/discuss") 
async def consensus_discuss(req: PromptRequest): 
    if not active_models: 
        raise HTTPException(status_code=400, detail="No models loaded.") 
 
    # Keep the tail — the Java layer builds this prompt with the most recent/
    # relevant content last (discussion history, then this model's own notes,
    # then the instruction), so truncating from the front preserves what
    # matters most when the full thing doesn't fit a small context window.
    prompt = req.prompt 
    if len(prompt) > MAX_DISCUSSION_PROMPT_CHARS: 
        prompt = prompt[-MAX_DISCUSSION_PROMPT_CHARS:] 
 
    results = [] 
    for m in active_models: 
        try: 
            answer = await asyncio.to_thread( 
                _discuss_on_cpu, m, prompt, req.system_prompt 
            ) 
            results.append({"model": m.name, "answer": answer, "path": m.path}) 
        except Exception as e: 
            print(f"Discussion failed for {m.name}: {e}") 
            results.append({ 
                "model": m.name, 
                "answer": f"[{m.name}] discussion skipped", 
                "path": m.path 
            }) 
 
    return results 
 
 
def _discuss_on_cpu(m: ConsensusModel, prompt: str, system_prompt: str) -> str: 
    if Llama is None: 
        return f"[{m.name}] simulation mode" 
    if not os.path.exists(m.path): 
        return f"[{m.name}] model file not found" 
 
    try: 
        # Reuse a cached CPU instance across discussion rounds instead of
        # reloading the whole GGUF file from disk on every single call —
        # previously this created and destroyed a fresh Llama() every round,
        # for every model, which is slow (full disk load each time) and eats
        # into the per-node timeout budget that should go toward generation.
        if m.discuss_llm is None:
            m.discuss_llm = Llama(
                model_path=m.path,
                n_gpu_layers=0,
                n_ctx=512,
                verbose=False,
            )
        cpu_llm = m.discuss_llm

        # `prompt` here is the real discussion prompt the Java layer built —
        # the base prompt (default, or the cluster's custom discussion prompt
        # from ClusterSettings), the rolling history of what other models said
        # in earlier rounds, and this model's own saved notes from last round,
        # already truncated to MAX_DISCUSSION_PROMPT_CHARS by the caller.
        #
        # Previously this function ignored all of that and rebuilt a generic
        # prompt from scratch by regex-matching one specific substring that
        # only exists in the *default* auto-generated base prompt — silently
        # breaking custom discussion prompts entirely, and meaning models
        # never saw each other's messages or their own notes, no matter what.
        # Using the real prompt directly fixes both at once.
        instruction = ( 
            "\n\nRespond to the discussion above in 2-3 short, direct sentences — " 
            "reference what others said or your own notes if there's anything " 
            "above. Then on a new line write: NOTES: followed by 1 short " 
            "sentence to remember for next round.\n\nYour response:" 
        ) 
        content = prompt.strip() + instruction 

        full_prompt = m.formatter( 
            [], content, 
            "You are an AI model in a discussion with other AI models. Be direct and specific." 
        ) 
        if len(full_prompt) > MAX_DISCUSSION_PROMPT_CHARS: 
            full_prompt = full_prompt[-MAX_DISCUSSION_PROMPT_CHARS:] 
 
        out = cpu_llm( 
            full_prompt, 
            max_tokens=DISCUSSION_TOKENS, 
            temperature=0.6, 
            stop=["<|im_end|>", "</s>", "<|eot_id|>", "\n\n\n"], 
        ) 
        raw = out["choices"][0]["text"].strip() 
 
        # Parse the notes marker case-insensitively — small models don't reliably 
        # match exact casing (e.g. "Notes:" instead of "NOTES:") even when the 
        # instruction spells it out, confirmed live during testing. 
        notes_match = re.search(r"notes:", raw, re.IGNORECASE) 
        if notes_match: 
            split_at = notes_match.start() 
            marker_end = notes_match.end() 
            return raw[:split_at].strip() + "\n<notes>" + raw[marker_end:].strip()[:200] + "</notes>" 
        return raw 
 
    except Exception as e: 
        print(f"CPU discussion error for {m.name}: {e}") 
        return f"[{m.name}] discussion error" 
    finally: 
        gc.collect() 


@app.post("/api/consensus/rate")
async def consensus_rate(req: RateRequest):
    """
    Each loaded model rates every answer (excluding its own) on 1–5.
    Returns a list of {evaluator, ratings: [{model, score}]}.
    """
    if not active_models:
        return []

    async def _rate_all(evaluator: ConsensusModel) -> Dict:
        ratings = []
        for ans in req.answers:
            # Skip self-rating to avoid bias
            if ans["model"] == evaluator.name:
                continue
            score = await asyncio.to_thread(
                evaluator.rate, req.prompt, ans["answer"], ans["model"]
            )
            ratings.append({"model": ans["model"], "score": score})
        return {"evaluator": evaluator.name, "ratings": ratings}

    results = await asyncio.gather(*(_rate_all(m) for m in active_models))
    return list(results)


@app.post("/api/consensus/ask")
async def consensus_ask(req: PromptRequest):
    """
    Single-node consensus: generate answers → rate them → rank and return.
    Used for standalone mode (not distributed cluster).
    """
    if not active_models:
        raise HTTPException(
            status_code=400,
            detail="No models active. Please load models first."
        )

    # Step 1: All models generate answers in parallel
    answers = await consensus_generate(req)

    # Step 2: All models rate each other's answers in parallel
    rate_req = RateRequest(
        prompt=req.prompt,
        answers=answers,
        system_prompt=req.system_prompt
    )
    ratings = await consensus_rate(rate_req)

    # Step 3: Aggregate scores
    model_scores: Dict[str, List[int]] = {}
    for entry in ratings:
        for r in entry["ratings"]:
            model_scores.setdefault(r["model"], []).append(r["score"])

    # Step 4: Build final ranked response list
    final_responses = []
    for ans in answers:
        scores = model_scores.get(ans["model"], [3])
        avg = sum(scores) / len(scores) if scores else 3.0
        final_responses.append({
            "model":     ans["model"],
            "answer":    ans["answer"],
            "path":      ans.get("path", ""),
            "avg_score": avg,
            "scores":    scores,
            "systemId":  "0",
        })

    # Sort descending by avg_score
    final_responses.sort(key=lambda x: x["avg_score"], reverse=True)
    winner = final_responses[0]

    return {"winner": winner, "all_responses": final_responses}


# ─────────────────────────────────────────────────────────────────────────────
# Model management
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/models/scan")
async def scan_models():
    """
    Scan the /models directory for supported model files.
    The directory is always the Docker-mounted volume — no user path needed.
    """
    path = MODELS_DIR

    # Ensure directory exists (creates it if not present in non-Docker dev mode)
    if not os.path.exists(path):
        fallback = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"
        )
        path = fallback
        os.makedirs(path, exist_ok=True)

    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Models directory not found: {path}")

    supported_extensions = (".gguf", ".bin", ".pt", ".safetensors")
    result = []
    try:
        for fname in sorted(os.listdir(path)):
            if not fname.lower().endswith(supported_extensions):
                continue
            full_path = os.path.join(path, fname)
            is_loaded = any(
                m.path == full_path or m.name == fname
                for m in active_models
            )
            size_bytes = os.path.getsize(full_path)
            result.append({
                "name":    fname,
                "path":    full_path,
                "size_gb": round(size_bytes / (1024 ** 3), 2),
                "loaded":  is_loaded,
            })
    except PermissionError:
        raise HTTPException(status_code=500, detail="Permission denied reading models directory.")

    return result


@app.post("/api/models/load")
async def load_model(req: ModelLoadRequest):
    global _model_loading_in_progress

    print(f"Load request: {req.name} at {req.path}")

    # ── Queue check — return busy if another load is in progress ─────────────
    if _model_loading_in_progress:
        retry_after = random.randint(20, 40)
        print(f"Load busy: {req.name} queued, retry in {retry_after}s")
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "busy", "retry_after": retry_after, "name": req.name}
        )

    # ── Resolve path ───────────────────────────────────────────────────────────
    target_path = req.path
    if not os.path.exists(target_path):
        filename = os.path.basename(req.path)
        for base in [MODELS_DIR, "/models"]:
            candidate = os.path.join(base, filename)
            if os.path.exists(candidate):
                target_path = candidate
                print(f"Resolved path: {target_path}")
                break

    if not os.path.exists(target_path):
        raise HTTPException(
            status_code=400,
            detail=f"Model file not found: {req.path}. Make sure it's in the /models volume."
        )

    # ── Duplicate check ────────────────────────────────────────────────────────
    with loading_lock:
        existing = next(
            (m for m in active_models if m.path == target_path or m.name == req.name),
            None
        )
        if existing:
            return {
                "status": "already_loaded",
                "name": req.name,
                "gpu_layers": existing.gpu_layers,
            }

        _, _, free_vram = get_vram_info()
        if free_vram is not None:
            file_mb = os.path.getsize(target_path) / (1024 * 1024)
            if file_mb > free_vram + 512:
                print(
                    f"Warning: {req.name} ({file_mb:.0f} MB) may exceed free VRAM "
                    f"({free_vram} MB). Will attempt CPU fallback layers."
                )

    # ── Load ───────────────────────────────────────────────────────────────────
    _model_loading_in_progress = True
    try:
        m = ConsensusModel(target_path, req.name)
        # Run the blocking load in a thread. m.load() can take 30s–2min+; calling it
        # directly here blocks the whole asyncio event loop for that entire time, so
        # a second concurrent /api/models/load request can never actually be read
        # and processed in time to observe "_model_loading_in_progress" as True —
        # it only gets evaluated after the first load already finished and reset the
        # flag. Wrapping in asyncio.to_thread frees the event loop during the load,
        # so concurrent requests are now serviced immediately and correctly get 503.
        await asyncio.to_thread(m.load)
        with loading_lock:
            active_models.append(m)
        print(f"Loaded: {req.name} ({m.gpu_layers} GPU layers)")
        return {"status": "loaded", "name": req.name, "gpu_layers": m.gpu_layers}
    except Exception as e:
        print(f"Failed to load {req.name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")
    finally:
        _model_loading_in_progress = False


# FIX: Accept `name` as a query parameter to match how the Java proxy calls this
# endpoint (POST /api/models/unload?name=xxx with no body).
@app.post("/api/models/unload")
async def unload_model_api(name: Optional[str] = Query(None, description="Name of the model to unload")):
    """Unload a model from memory and free resources."""
    global active_models

    if not name:
        raise HTTPException(status_code=422, detail="Model name is required as a query parameter (?name=...)")

    to_remove = [m for m in active_models if m.name == name]
    active_models = [m for m in active_models if m.name != name]

    if not to_remove:
        return {"status": "not_found", "name": name}

    # Properly release LLM memory before GC
    for m in to_remove:
        try:
            m.unload()
        except Exception as e:
            print(f"Error unloading {name}: {e}")

    gc.collect()
    print(f"Unloaded: {name}")
    return {"status": "unloaded", "name": name}


@app.get("/api/models/active")
async def list_active_models():
    """Return all currently loaded models with their stats."""
    return [
        {
            "name":       m.name,
            "score":      m.score,
            "wins":       m.wins,
            "losses":     m.losses,
            "votes":      m.votes,
            "gpu_layers": m.gpu_layers,
        }
        for m in active_models
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Proxy to System Monitor
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/system-stats")
async def proxy_stats():
    try:
        res = await app.state.client.get("/api/system-stats")
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.get("/api/recording/status")
async def proxy_recording_status():
    try:
        res = await app.state.client.get("/api/recording/status")
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.post("/api/recording/start")
async def proxy_recording_start(folder: str = "system"):
    try:
        res = await app.state.client.post("/api/recording/start", params={"folder": folder})
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.post("/api/recording/stop")
async def proxy_recording_stop():
    try:
        res = await app.state.client.post("/api/recording/stop")
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.get("/api/recordings/list")
async def proxy_recordings_list():
    try:
        res = await app.state.client.get("/api/recordings/list")
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.get("/api/recordings/view/{filename}")
async def proxy_recording_view(filename: str, folder: Optional[str] = None):
    try:
        params = {"folder": folder} if folder else {}
        res = await app.state.client.get(f"/api/recordings/view/{filename}", params=params)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.delete("/api/recordings/delete/{filename}")
async def proxy_recording_delete(filename: str, folder: Optional[str] = None):
    try:
        params = {"folder": folder} if folder else {}
        res = await app.state.client.delete(f"/api/recordings/delete/{filename}", params=params)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.post("/api/recordings/move")
async def proxy_recording_move(body: dict):
    try:
        res = await app.state.client.post("/api/recordings/move", json=body)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.post("/api/recordings/create-folder")
async def proxy_create_folder(body: dict):
    try:
        res = await app.state.client.post("/api/recordings/create-folder", json=body)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"System monitor unreachable: {e}")


@app.get("/api/logs/recent")
async def get_recent_logs():
    return [
        {"time": time.strftime("%H:%M:%S"), "level": "INFO",  "msg": "Gateway initialized."},
        {"time": time.strftime("%H:%M:%S"), "level": "DEBUG", "msg": f"GPU probe: {'OK' if _NVML_OK else 'N/A (CPU mode)'}."},
        {"time": time.strftime("%H:%M:%S"), "level": "INFO",  "msg": f"{len(active_models)} model(s) loaded."},
    ]


@app.get("/api/health") 
async def health_check(): 
    """Simple health check for ngrok status indicator and monitoring.""" 
    return { 
        "status": "ok", 
        "models_loaded": len(active_models), 
        "gpu_available": _NVML_OK, 
    } 
 
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)