# NeuralDocker Selective

![Status](https://img.shields.io/badge/status-active%20development-yellow)
![Backend](https://img.shields.io/badge/backend-Spring%20Boot-brightgreen)
![Frontend](https://img.shields.io/badge/frontend-React-blue)
![AI](https://img.shields.io/badge/AI-llama.cpp%20%2F%20GGUF-orange)
![License](https://img.shields.io/badge/license-Academic%20%2F%20Research-lightgrey)

---

## What is this?

NeuralDocker Selective is a **self-hosted, distributed AI infrastructure tool**. It is not a wrapper around a cloud API — it runs real local AI models (GGUF format via llama.cpp) across a cluster of machines, makes them collaborate on every question, and returns the answer that the models collectively agree is best.

Think of it as building your own private AI cluster where multiple models vote on answers, weak models get replaced automatically, and the whole system improves over time.

---

## How it works

1. **Create a cluster** — one machine acts as the host
2. **Load models** — drag GGUF model files into the `/models` folder, load them from the dashboard
3. **Other machines join** — via cluster ID and password (uses ngrok for cross-network connectivity)
4. **Ask a question** — the question goes to all loaded models simultaneously
5. **Models answer independently** — no model knows what others said
6. **Models vote** — each model rates every other model's answer 1–5 (blind peer review)
7. **Best answer wins** — highest consensus score is returned to the user
8. **Models improve** — scores accumulate, weighted voting gives better models more influence
9. **Weak models rotate out** — at session end, lowest scorer is replaced from the model queue

---

## Key Features

**Cluster Management**
- Create public (password-protected) or private (invite-only) clusters
- Join clusters by browsing public clusters or entering a cluster ID directly
- Host controls all model operations — workers share resources only
- Real-time node status with automatic offline detection and recovery

**Consensus Engine**
- Parallel query dispatch to all loaded models
- Blind peer voting (1–5 scale, models don't know who wrote what)
- Weighted voting — models with better track records have more influence (0.5× to 1.5×)
- Score normalization at session end to prevent permanent dominance
- Configurable session length (default 10 questions)

**Model Management**
- Load/unload GGUF models from the dashboard
- Smart GPU layer calculation with VRAM safety margins
- Automatic GPU detection with CPU fallback
- Model queue — files in `/models` folder are auto-discovered
- Auto-rotation — lowest scoring model replaced at session end (optional)
- Skeleton slots — empty model slots preserve score history for future models

**Post-Session Discussion** *(Experimental)*
- After each session, models discuss the session with each other
- Each model maintains private notes (up to 200 words) that persist while loaded
- Notes survive across sessions as long as the model stays loaded
- Anonymous discussion mode available
- Configurable number of discussion rounds

**System Monitoring**
- Real-time CPU, RAM, GPU, and network graphs
- Session recording — capture hardware metrics over time
- Recording playback with metric selector (CPU/RAM/GPU/Network)
- Per-node resource monitoring for all cluster members

**API Hosting** *(Host only)*
- Built-in API tool exposes your cluster as a usable AI API
- Shows curl, JavaScript, and Python code examples
- Live test panel — send requests directly from the browser
- Full response schema documentation

**Ngrok Integration**
- Free ngrok tunnels enable cross-network cluster connectivity
- Automatic tunnel URL detection and backend registration
- Visual tunnel status indicator in the cluster dashboard

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind |
| Backend | Spring Boot (Java 21) |
| AI Service | Python + llama-cpp-python |
| System Monitor | Python + psutil + pynvml |
| Database | PostgreSQL 16 |
| Tunnel | ngrok (free tier) |
| Containers | Docker + Docker Compose |
| GPU | NVIDIA CUDA (configurable), AMD/CPU-only fallback |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│            Browser (React)                   │
│  Cluster Dashboard · Model Manager · API     │
└─────────────────┬─────────────────────────────┘
                  │ REST + JWT
┌─────────────────▼─────────────────────────────┐
│         Spring Boot Backend                   │
│  Auth · Cluster Management · Consensus        │
│  Voting Engine · Node Recovery · Proxy        │
└──────┬──────────────────────┬─────────────────┘
       │ HTTP                 │ HTTP
┌──────▼──────┐        ┌──────▼──────┐
│  AI Service │  . . . │  AI Service │   (one per node)
│  llama.cpp  │        │  llama.cpp  │
│  GPU/CPU    │        │  GPU/CPU    │
└──────┬──────┘        └─────────────┘
       │
┌──────▼───────┐
│System Monitor│
│psutil+pynvml │
└──────────────┘
```

---

## Getting Started

### Requirements

- **Docker Desktop** (Windows/Linux/macOS), with WSL2 backend on Windows
- **One of the following** (pick what matches your machine — see [Hardware Setup](#hardware-setup) below):
  - NVIDIA GPU with CUDA 12.x drivers (fastest)
  - AMD GPU — currently runs in CPU-only mode (ROCm support planned)
  - No GPU — CPU-only mode works on any machine, just slower
- **GGUF model files** — download from Hugging Face (recommended: 1B–7B parameter models for most setups)
- **ngrok account** (optional) — only needed if you want other machines to join your cluster over the network

### 1. Clone the repo

```bash
git clone https://github.com/your-username/neuraldocker-selective.git
cd neuraldocker-selective
```

### 2. Add your models

```bash
mkdir -p models
# Copy .gguf files into /models, e.g. Llama-3.2-1B-Instruct-Q4_K_M.gguf
```

### 3. Set up your `.env` file

Create a `.env` file in the project root with your ngrok token (skip this if you don't need cross-network clusters yet — you can add it later):

```bash
NGROK_AUTHTOKEN=your_token_here
```
Get a free token at `https://dashboard.ngrok.com/get-started/your-authtoken`.

### 4. Hardware Setup

This is the part that changes depending on your machine. **If you're not sure, just use the default — it works on the most common case and you can always change it later.**

| Your situation | What to run |
|---|---|
| 🟢 **Not sure / just want it running** | Skip straight to step 5 below — `docker compose up --build` uses the validated default config (NVIDIA, CUDA 12.4) |
| 🎯 **NVIDIA GPU, different CUDA version** | Run `./setup.sh`, pick option 1, then select your CUDA version |
| ⚪ **No GPU / AMD GPU** | Run `./setup.sh`, pick option 2 or 3 (both currently run CPU-only) |

`setup.sh` never runs Docker for you — it just asks a couple of questions, writes a `.env` entry, and prints the exact command to run next. Nothing is installed or changed until you run that command yourself.

Run it with:
```bash
chmod +x setup.sh
./setup.sh
```

### 5. Start everything

Pick the command that matches what you chose above:

```bash
# Default — NVIDIA, validated config (RTX 4050 / CUDA 12.4), no setup.sh needed
docker compose up --build

# NVIDIA, custom CUDA version (after running setup.sh option 1)
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up --build

# CPU-only / AMD (after running setup.sh option 2 or 3)
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up --build
```

### 6. Open the app

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8081 |
| AI Service | http://localhost:8000 |
| pgAdmin | http://localhost:5050 |

---

## First Run

1. Go to `http://localhost:3000` and register an account
2. Create a cluster (Dashboard → Create Cluster)
3. Go to the Cluster dashboard
4. Click **Manage** → scan folder → load a model
5. Ask a question in the prompt bar
6. Watch the consensus panel populate with model responses and scores

---

## Adding Another Node (Cross-Network)

1. Follow the same setup on the new machine — clone, models, `.env` with your ngrok token, and the matching hardware setup for *that* machine (it doesn't need to match the host's GPU setup)
2. Start it with the command matching step 4/5 above
3. The ngrok tunnel URL automatically registers with the host backend
4. Join via Dashboard → Join Cluster → enter the host's cluster ID and password

---

## Project Structure

```
NeuralDocker Selective/
├── Backend/                    # Spring Boot backend
│   └── Neural-docker-selective-backend/
│       └── src/main/java/
│           └── .../
│               ├── config/     # Security, CORS, exception handling
│               ├── controller/ # REST endpoints
│               ├── dto/        # Request/response objects
│               ├── model/      # JPA entities
│               ├── repository/ # Database access
│               ├── security/   # JWT + service token filters
│               └── service/    # Business logic
├── Frontend/                   # React + Vite frontend
│   └── src/
│       ├── pages/              # All page components
│       ├── components/         # Shared components
│       └── layouts/            # Layout wrappers
├── ai-service/                 # llama.cpp Python service
│   ├── Dockerfile               # NVIDIA, pinned default (CUDA 12.4 / cu122)
│   ├── Dockerfile.nvidia        # NVIDIA, configurable CUDA version
│   ├── Dockerfile.cpu           # CPU-only build
│   └── main.py                  # FastAPI app, consensus engine
├── system-monitor/             # Hardware metrics service
│   └── System_resource_monitor.py
├── Ngrok/                       # Tunnel management
│   └── ngrok_monitor.py
├── models/                      # GGUF model files (gitignored)
├── recordings/                  # Session recordings (gitignored)
├── docker-compose.yml           # Default — pinned NVIDIA dev config (unchanged)
├── docker-compose.cpu.yml       # Override — CPU-only / AMD
├── docker-compose.nvidia.yml    # Override — custom NVIDIA CUDA version
└── setup.sh                     # Interactive hardware setup wizard
```

---

## Cluster Settings

All major behaviors are configurable per cluster:

| Setting | Default | Description |
|---|---|---|
| Session Length | 10 | Questions per session before rotation check |
| Auto-Rotation | Off | Replace lowest scorer at session end |
| Auto-Queue | On | Load next model from queue after rotation |
| Weighted Voting | On | Better models get more voting influence |
| Node Timeout | 40s | Time to wait for a slow node |
| Max Timeouts | 3 | Timeouts before node marked offline |
| Recovery Ping | 40s | How often to ping offline nodes |
| Model Discussion | Off | Post-session model reflection (experimental) |
| Discussion Rounds | 2 | Rounds of model discussion per session end |
| Max Tokens | 512 | Maximum tokens per model response |
| Temperature | 0.7 | Response randomness (0 = focused, 2 = creative) |

---

## Understanding Scores

- Models start at **0 points**
- Each question: peers rate the answer 1–5. Score changes by `(avg_rating - 3) × 10`
  - Perfect 5/5 → +20 points
  - Neutral 3/5 → 0 points
  - Poor 1/5 → -20 points
- At session end, scores compress by 20% toward zero if the gap between best and worst exceeds 100 points — this keeps competition fair
- Negative score = consistently underperforming. Auto-rotation removes the most negative model

---

## Security Notes

- JWT authentication on all endpoints (15-minute token expiry)
- Public cluster endpoints are unauthenticated (browsing only)
- Internal service communication uses a separate service token (`SERVICE_TOKEN` env var)
- Change `SERVICE_TOKEN` and all passwords before any public deployment
- ngrok tunnel registration requires the service token

---

## Known Limitations

- **Single GPU per node** — multi-GPU support not implemented
- **AMD GPUs run CPU-only for now** — ROCm/HIP acceleration is planned but not yet implemented
- **Free ngrok** — tunnel URLs change on restart, monitor re-registers automatically
- **GGUF only** — other model formats (.pt, .safetensors) detected but not guaranteed to work
- **Non-default NVIDIA CUDA versions are untested** — only CUDA 12.4 / cu122 is validated; other versions use published llama-cpp-python wheels and should work, but haven't been confirmed on this project
- **Experimental discussion** — post-session model discussion uses CPU inference to avoid CUDA state issues after heavy GPU use

---

## Current Status

| Feature | Status |
|---|---|
| User authentication (JWT) | ✅ Complete |
| Cluster creation and management | ✅ Complete |
| Public cluster discovery | ✅ Complete |
| Model loading with GPU detection | ✅ Complete |
| Parallel consensus engine | ✅ Complete |
| Blind peer voting | ✅ Complete |
| Weighted voting | ✅ Complete |
| Score tracking and normalization | ✅ Complete |
| Auto-rotation with queue | ✅ Complete |
| Skeleton slot system | ✅ Complete |
| Node timeout and recovery | ✅ Complete |
| System resource monitoring | ✅ Complete |
| Session recording and playback | ✅ Complete |
| Post-session model discussion | ✅ Experimental |
| Model cache memory (notes) | ✅ Experimental |
| Ngrok tunnel integration | ✅ Complete |
| Built-in API hosting tool | ✅ Complete |
| Hardware-aware Docker setup (NVIDIA version picker, CPU fallback) | ✅ Complete |
| Multi-machine deployment | 🔄 Requires ngrok |
| AMD ROCm GPU acceleration | 📋 Planned |
| Role-based model specialization | 📋 Planned |
| RAG integration | 📋 Planned |

---

## License

Academic and research use. All rights reserved by the authors.