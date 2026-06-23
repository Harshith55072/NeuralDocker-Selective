import psutil
import GPUtil
try:
    import pynvml
    pynvml.nvmlInit()
    _NVML_OK = True
except Exception:
    _NVML_OK = False
import time
import platform
import os
import json
import shutil
import threading
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="System Monitor API", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings") 
os.makedirs(RECORDINGS_DIR, exist_ok=True) 
 
# Stats collection interval — CPU measurement uses this as its sampling window 
# Higher = smoother but less responsive. 0.5s is a good balance. 
STATS_SAMPLE_INTERVAL = float(os.getenv("STATS_SAMPLE_INTERVAL", "0.5")) 

# Max samples before recording auto-stops (prevents memory exhaustion) 
# At 1 sample/sec this is ~2 hours of recording 
MAX_RECORDING_SAMPLES = 7200 

# Auto-save interval in seconds — saves a checkpoint while recording 
# so data isn't lost if the process crashes 
AUTO_SAVE_INTERVAL = 30 


class SystemMonitor:
    def __init__(self): 
        self.start_time = time.time() 
        self.prev_net_io = None 
        self.prev_time = None 
        self.is_recording = False 
        self.recording_data = [] 
        self.recording_start_time = None 
        self.recording_filename = None 
        self.recording_folder = None 
        self._lock = threading.Lock() 
        self._last_auto_save = time.time() 
        self._auto_stop_needed = False 
        # Prime the CPU counter so the first real call returns a valid delta. 
        psutil.cpu_percent(interval=None) 

    def get_uptime(self):
        delta = timedelta(seconds=int(time.time() - psutil.boot_time()))
        days = delta.days
        hours, remainder = divmod(delta.seconds, 3600)
        minutes, _ = divmod(remainder, 60)
        return f"{days}d {hours}h {minutes}m"

    def get_system_info(self):
        u = platform.uname()
        return {
            "os": f"{u.system} {u.release}",
            "node_name": u.node,
            "architecture": platform.machine(),
            "uptime": self.get_uptime(),
            "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat(),
        }

    def get_cpu_usage(self):
        # Using a tiny interval (0.1s) ensures we get a fresh reading even on the first call
        # while keeping the response time very low.
        per_core = psutil.cpu_percent(interval=STATS_SAMPLE_INTERVAL, percpu=True)
        overall = round(sum(per_core) / len(per_core), 1) if per_core else 0.0

        freq = psutil.cpu_freq()

        cpu_temp = None
        try:
            temps = psutil.sensors_temperatures()
            for key in ("coretemp", "cpu_thermal", "k10temp"):
                if key in temps:
                    cpu_temp = temps[key][0].current
                    break
        except Exception:
            pass

        cpu_name = platform.processor()
        try:
            if platform.system() != "Windows":
                with open("/proc/cpuinfo") as f:
                    for line in f:
                        if "model name" in line:
                            cpu_name = line.split(":")[1].strip()
                            break
        except Exception:
            pass

        return {
            "name": cpu_name,
            "usage": overall,
            "cores": psutil.cpu_count(logical=False),
            "threads": psutil.cpu_count(logical=True),
            "per_core_usage": [round(p, 1) for p in per_core],
            "frequency": {
                "current": f"{freq.current:.0f} MHz" if freq else "N/A",
                "min": f"{freq.min:.0f} MHz" if freq else "N/A",
                "max": f"{freq.max:.0f} MHz" if freq else "N/A",
            },
            "temperature": round(cpu_temp, 1) if cpu_temp else None,
        }

    def get_memory_usage(self):
        m = psutil.virtual_memory()
        return {
            "total": round(m.total / 1024**3, 1),
            "available": round(m.available / 1024**3, 1),
            "used": round(m.used / 1024**3, 1),
            "free": round(m.free / 1024**3, 1),
            "percentage": round(m.percent, 1),
        }

    def get_gpu_usage(self):
        global _NVML_OK
        gpus = []
        
        # Try to re-init NVML if it failed at startup (GPU may not have been ready)
        if not _NVML_OK:
            try:
                pynvml.nvmlInit()
                _NVML_OK = True
                print("NVML re-initialized in system-monitor")
            except Exception:
                pass

        # Method 1: pynvml (more reliable in containers)
        if _NVML_OK:
            try:
                device_count = pynvml.nvmlDeviceGetCount()
                for i in range(device_count):
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                    name = pynvml.nvmlDeviceGetName(handle)
                    if isinstance(name, bytes):
                        name = name.decode('utf-8')
                        
                    gpus.append({
                        "id": i,
                        "name": name,
                        "load": float(util.gpu),
                        "memory_total": round(info.total / 1024**3, 1), # GB
                        "memory_used": round(info.used / 1024**3, 1),   # GB
                        "memory_free": round(info.free / 1024**3, 1),   # GB
                        "temperature": float(temp),
                    })
                if gpus:
                    return gpus
            except Exception as e:
                print(f"NVML GPU error: {e}")

        # Method 2: GPUtil fallback
        try:
            return [
                {
                    "id": g.id,
                    "name": g.name,
                    "load": round(g.load * 100, 1),
                    "memory_total": round(g.memoryTotal / 1024, 1), # MB → GB
                    "memory_used": round(g.memoryUsed / 1024, 1),   # MB → GB
                    "memory_free": round((g.memoryTotal - g.memoryUsed) / 1024, 1), # MB → GB
                    "temperature": round(g.temperature, 1) if g.temperature else None,
                }
                for g in GPUtil.getGPUs()
            ]
        except Exception:
            return []

    def get_disk_usage(self):
        disks = []
        seen_devices = {}  # device -> already-added entry

        ignored_types = {
            'tmpfs', 'devtmpfs', 'devfs', 'iso9660', 'overlay',
            'squashfs', 'udf', 'proc', 'sysfs', 'cgroup', 'cgroup2',
            'pstore', 'mqueue', 'hugetlbfs', 'debugfs', 'tracefs',
            'securityfs', 'fusectl', 'configfs', 'ramfs', 'bpf',
            '9p',  # WSL driver bind-mounts — not real disks
        }

        ignored_mountpoint_prefixes = (
            '/proc', '/sys', '/dev', '/run',
            '/var/lib/docker', '/var/lib/containers',
            '/etc/',        # Docker bind-mounts config files here
            '/usr/bin',     # WSL driver mounts
            '/usr/lib/wsl', # WSL driver mounts
        )

        # Preferred mountpoints — if a device appears multiple times,
        # prefer the shortest/most meaningful mountpoint
        preferred_mountpoints = ('/', '/app', '/data', '/home', '/mnt', '/storage')

        for part in psutil.disk_partitions(all=True):
            fstype = part.fstype.lower() if part.fstype else ''
            mountpoint = part.mountpoint or ''
            device = part.device or ''

            if fstype in ignored_types:
                continue
            if not device:
                continue
            if any(mountpoint.startswith(p) for p in ignored_mountpoint_prefixes):
                continue

            try:
                usage = psutil.disk_usage(mountpoint)
                if usage.total < 100 * 1024 * 1024:  # Skip < 100MB
                    continue

                # Deduplicate by device: keep the most meaningful mountpoint
                if device in seen_devices:
                    prev_mp = seen_devices[device]['mountpoint']
                    # Prefer shorter mountpoints, or ones in the preferred list
                    current_is_preferred = any(mountpoint.startswith(p) for p in preferred_mountpoints)
                    prev_is_preferred = any(prev_mp.startswith(p) for p in preferred_mountpoints)
                    if current_is_preferred and not prev_is_preferred:
                        # Replace with better mountpoint
                        seen_devices[device]['mountpoint'] = mountpoint
                    # Either way, don't add a duplicate
                    continue

                entry = {
                    "device": device,
                    "mountpoint": mountpoint,
                    "fstype": part.fstype,
                    "total": round(usage.total / 1024**3, 1),
                    "used": round(usage.used / 1024**3, 1),
                    "free": round(usage.free / 1024**3, 1),
                    "percentage": round(usage.percent, 1),
                }
                seen_devices[device] = entry
                disks.append(entry)

            except (PermissionError, OSError):
                continue

        # Docker fallback — if nothing found, show root
        if not disks:
            try:
                usage = psutil.disk_usage('/')
                disks.append({
                    "device": "overlay",
                    "mountpoint": "/",
                    "fstype": "overlay",
                    "total": round(usage.total / 1024**3, 1),
                    "used": round(usage.used / 1024**3, 1),
                    "free": round(usage.free / 1024**3, 1),
                    "percentage": round(usage.percent, 1),
                })
            except Exception:
                pass

        return disks 

    def get_network_usage(self):
        net = psutil.net_io_counters()
        now = time.time()
        if self.prev_net_io is None:
            self.prev_net_io = net
            self.prev_time = now
            return {"download_speed": 0.0, "upload_speed": 0.0, "status": "Initializing"}
        dt = now - self.prev_time
        dl = round(((net.bytes_recv - self.prev_net_io.bytes_recv) * 8) / (1024 * 1024 * dt), 2) if dt > 0 else 0
        ul = round(((net.bytes_sent - self.prev_net_io.bytes_sent) * 8) / (1024 * 1024 * dt), 2) if dt > 0 else 0
        self.prev_net_io = net
        self.prev_time = now
        return {"download_speed": max(dl, 0), "upload_speed": max(ul, 0), "status": "Connected"}

    def get_all_stats(self):
        cpu = self.get_cpu_usage()
        mem = self.get_memory_usage()
        gpu = self.get_gpu_usage()
        net = self.get_network_usage()
        disk = self.get_disk_usage()

        stats = {
            "timestamp": datetime.now().isoformat(),
            "system": self.get_system_info(),
            "cpu": cpu,
            "memory": mem,
            "gpu": gpu,
            "network": net,
            "disk": disk,
        }

        with self._lock: 
            if self.is_recording: 
                elapsed = (datetime.now() - self.recording_start_time).total_seconds() 
                self.recording_data.append({ 
                    "time": round(elapsed, 1), 
                    "cpu": cpu["usage"], 
                    "memory": mem["percentage"], 
                    "gpu": gpu[0]["load"] if gpu else 0, 
                    "gpu_memory": round( 
                        (gpu[0]["memory_used"] / gpu[0]["memory_total"]) * 100, 1 
                    ) if gpu and gpu[0]["memory_total"] else 0, 
                    "net_down": net["download_speed"], 
                    "net_up": net["upload_speed"], 
                    "ram_used": mem["used"], 
                    "ram_total": mem["total"], 
                }) 
        
                # Auto-stop if max samples reached to prevent memory exhaustion 
                if len(self.recording_data) >= MAX_RECORDING_SAMPLES: 
                    print(f"Recording auto-stopped: reached max samples ({MAX_RECORDING_SAMPLES})") 
                    # Release lock before calling stop to avoid deadlock 
                    # We set a flag and handle outside the lock 
                    self._auto_stop_needed = True 
        
                # Auto-save checkpoint every AUTO_SAVE_INTERVAL seconds 
                now = time.time() 
                if now - self._last_auto_save >= AUTO_SAVE_INTERVAL and self.recording_filename: 
                    self._save_checkpoint() 
                    self._last_auto_save = now 
        
        return stats 
    
    def _save_checkpoint(self): 
        """Save current recording data to disk without stopping the recording. 
        Called automatically every AUTO_SAVE_INTERVAL seconds. 
        Must be called while self._lock is held.""" 
        if not self.recording_filename or not self.recording_folder: 
            return 
        try: 
            system_info = self.get_system_info() 
            payload = { 
                "meta": { 
                    "filename": self.recording_filename, 
                    "started_at": self.recording_start_time.isoformat(), 
                    "ended_at": None,  # Still recording 
                    "duration": round( 
                        (datetime.now() - self.recording_start_time).total_seconds(), 1 
                    ), 
                    "sample_count": len(self.recording_data), 
                    "system": system_info, 
                    "folder": self.recording_folder, 
                    "checkpoint": True,  # Marks this as an in-progress save 
                }, 
                "samples": list(self.recording_data),  # Copy to avoid mutation 
            } 
            filepath = os.path.join( 
                RECORDINGS_DIR, self.recording_folder, self.recording_filename 
            ) 
            # Write to temp file first then rename — prevents corrupt files 
            temp_path = filepath + ".tmp" 
            with open(temp_path, "w") as f: 
                json.dump(payload, f, indent=2) 
            os.replace(temp_path, filepath) 
            print(f"Auto-save checkpoint: {self.recording_filename} ({len(self.recording_data)} samples)") 
        except Exception as e: 
            print(f"Auto-save failed: {e}") 
 

    def start_recording(self, folder: str = "system") -> bool:
        with self._lock:
            if self.is_recording:
                return False
            self.is_recording = True
            self.recording_data = []
            self.recording_start_time = datetime.now()
            self.recording_folder = folder
            folder_path = os.path.join(RECORDINGS_DIR, folder)
            os.makedirs(folder_path, exist_ok=True)
            self.recording_filename = (
                f"session_{self.recording_start_time.strftime('%Y%m%d_%H%M%S')}.json"
            )
            return True

    def stop_recording(self):
        with self._lock:
            if not self.is_recording:
                return None
            system_info = self.get_system_info()
            payload = {
                "meta": {
                    "filename": self.recording_filename,
                    "started_at": self.recording_start_time.isoformat(),
                    "ended_at": datetime.now().isoformat(),
                    "duration": round(
                        (datetime.now() - self.recording_start_time).total_seconds(), 1
                    ),
                    "sample_count": len(self.recording_data),
                    "system": system_info,
                    "folder": self.recording_folder,
                },
                "samples": self.recording_data,
            }
            filepath = os.path.join(
                RECORDINGS_DIR, self.recording_folder, self.recording_filename
            )
            with open(filepath, "w") as f:
                json.dump(payload, f, indent=2)
            saved = self.recording_filename
            self.is_recording = False
            self.recording_filename = None
            self.recording_folder = None
            self.recording_data = []
            return saved


monitor = SystemMonitor()


# ── Helper ────────────────────────────────────────────────────────────────────

def _find_recording(filename: str, folder: str = None):
    """Return the absolute path to a recording file, or None if not found."""
    filename = os.path.basename(filename)
    if folder:
        candidate = os.path.join(RECORDINGS_DIR, folder, filename)
        if os.path.exists(candidate):
            return candidate
    for root, _dirs, filenames in os.walk(RECORDINGS_DIR):
        if filename in filenames:
            return os.path.join(root, filename)
    return None


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/system-stats")
async def get_system_stats():
    return monitor.get_all_stats()


@app.post("/api/recording/start")
async def start_recording(folder: str = "system"):
    if monitor.start_recording(folder):
        return {"status": "started", "filename": monitor.recording_filename, "folder": folder}
    return {"status": "already_recording"}


@app.post("/api/recording/stop")
async def stop_recording():
    filename = monitor.stop_recording()
    if filename:
        return {"status": "stopped", "filename": filename}
    return {"status": "not_recording"}


@app.get("/api/recording/status")
async def get_recording_status():
    duration = 0.0
    if monitor.is_recording and monitor.recording_start_time:
        duration = (datetime.now() - monitor.recording_start_time).total_seconds()
    return {
        "is_recording": monitor.is_recording,
        "filename": monitor.recording_filename,
        "duration": round(duration, 1),
        "sample_count": len(monitor.recording_data),
    }


@app.get("/api/recordings/list") 
async def list_recordings(): 
    files = [] 
    for root, _dirs, filenames in os.walk(RECORDINGS_DIR): 
        for fname in filenames: 
            if not fname.endswith(".json"): 
                continue 
            fpath = os.path.join(root, fname) 
            rel_folder = os.path.relpath(root, RECORDINGS_DIR) 
            display_folder = "root" if rel_folder == "." else rel_folder 
            size_kb = round(os.path.getsize(fpath) / 1024, 1) 
            try: 
                # Read only the first 2KB to extract metadata 
                # Full files can be large — we don't need samples for the list 
                with open(fpath) as f: 
                    # JSON meta is always at the start of the file 
                    # Read enough to get the meta block without loading samples 
                    partial = f.read(2048) 
 
                # Find where samples array starts and truncate before it 
                # so we can parse just the meta section 
                samples_idx = partial.find('"samples"') 
                if samples_idx > 0: 
                    # Close the meta object manually 
                    partial = partial[:samples_idx].rstrip().rstrip(',') + '}' 
                
                try: 
                    data = json.loads(partial) 
                    meta = data.get("meta", {}) 
                except json.JSONDecodeError: 
                    # Fallback — read full file if partial parse fails 
                    with open(fpath) as f2: 
                        data = json.load(f2) 
                    meta = data.get("meta", {}) 
 
                files.append({ 
                    "filename": fname, 
                    "started_at": meta.get("started_at", ""), 
                    "duration": meta.get("duration", 0), 
                    "sample_count": meta.get("sample_count", 0), 
                    "size_kb": size_kb, 
                    "folder": display_folder, 
                    "is_checkpoint": meta.get("checkpoint", False), 
                }) 
            except Exception: 
                files.append({ 
                    "filename": fname, 
                    "started_at": "", 
                    "duration": 0, 
                    "sample_count": 0, 
                    "size_kb": size_kb, 
                    "folder": display_folder, 
                    "is_checkpoint": False, 
                }) 
    return sorted(files, key=lambda x: x["started_at"], reverse=True) 


@app.get("/api/recordings/view/{filename}")
async def view_recording(filename: str, folder: str = None):
    path = _find_recording(filename, folder)
    if not path:
        raise HTTPException(status_code=404, detail="Recording not found")
    with open(path) as f:
        return json.load(f)


@app.delete("/api/recordings/delete/{filename}")
async def delete_recording(filename: str, folder: str = None):
    path = _find_recording(filename, folder)
    if not path:
        raise HTTPException(status_code=404, detail="Recording not found")
    os.remove(path)
    return {"status": "deleted", "filename": filename}


@app.post("/api/recordings/move")
async def move_recording(body: dict):
    """Move a recording from one folder to another."""
    filename = body.get("filename", "")
    from_folder = body.get("from_folder", "")
    to_folder = body.get("to_folder", "")

    if not filename:
        raise HTTPException(status_code=400, detail="filename required")

    src = _find_recording(filename, from_folder or None)
    if not src:
        raise HTTPException(status_code=404, detail="Recording not found")

    dest_dir = os.path.join(RECORDINGS_DIR, to_folder) if to_folder else RECORDINGS_DIR
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, os.path.basename(filename))

    if os.path.abspath(src) == os.path.abspath(dest):
        return {"status": "no-op", "message": "Source and destination are the same"}

    if os.path.exists(dest):
        raise HTTPException(
            status_code=409,
            detail="A file with that name already exists in the target folder",
        )

    shutil.move(src, dest)

    try:
        with open(dest) as f:
            data = json.load(f)
        data.setdefault("meta", {})["folder"] = to_folder or "root"
        with open(dest, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

    return {"status": "moved", "filename": filename, "to_folder": to_folder or "root"}


@app.post("/api/recordings/create-folder")
async def create_folder(body: dict):
    """Create an empty sub-folder inside the recordings directory."""
    folder = body.get("folder", "").strip()
    folder = folder.replace("/", "").replace("\\", "").replace("..", "")
    if not folder:
        raise HTTPException(status_code=400, detail="folder name required")

    folder_path = os.path.join(RECORDINGS_DIR, folder)
    os.makedirs(folder_path, exist_ok=True)

    keep = os.path.join(folder_path, ".keep")
    if not os.path.exists(keep):
        open(keep, "w").close()

    return {"status": "created", "folder": folder}


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Starting System Monitor API on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
