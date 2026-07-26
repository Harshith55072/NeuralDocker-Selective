#!/usr/bin/env bash
set -e

# Upsert KEY=VALUE into .env without touching any other line.
# Creates .env if it doesn't exist yet. Safe to call repeatedly.
set_env_var() {
  local key="$1" value="$2" file=".env"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    grep -v "^${key}=" "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
  fi
  echo "${key}=${value}" >> "$file"
}

echo "=================================================="
echo " NeuralDocker Selective — Setup"
echo "=================================================="
echo ""
if [ -f .env ]; then
  echo "(Existing .env found — this will only add/update the CUDA_* lines"
  echo " below. NGROK_AUTHTOKEN, JWT_SECRET, SERVICE_TOKEN, and anything"
  echo " else you already have in there are left untouched.)"
  echo ""
fi
echo "1) NVIDIA GPU"
echo "2) AMD GPU"
echo "3) No GPU / CPU only"
echo "4) Skip — use the pinned dev default (RTX 4050 / cu122)"
echo ""
read -p "What hardware do you have? [1-4]: " choice

case "$choice" in
  1)
    if command -v nvidia-smi &> /dev/null; then
      echo ""
      echo "Detected NVIDIA driver info (for reference only):"
      nvidia-smi --query-gpu=name,driver_version --format=csv,noheader || true
      echo ""
    fi
    echo "Which CUDA version is installed on your host?"
    echo "  1) CUDA 12.4  (matches the validated dev config)"
    echo "  2) CUDA 12.3"
    echo "  3) CUDA 12.2"
    echo "  4) CUDA 12.1"
    echo "  5) CUDA 11.8"
    read -p "Choice [1-5]: " cuda_choice
    case "$cuda_choice" in
      1) BASE_IMAGE="nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04"; WHEEL_TAG="cu124" ;;
      2) BASE_IMAGE="nvidia/cuda:12.3.2-runtime-ubuntu22.04";       WHEEL_TAG="cu123" ;;
      3) BASE_IMAGE="nvidia/cuda:12.2.0-runtime-ubuntu22.04";       WHEEL_TAG="cu122" ;;
      4) BASE_IMAGE="nvidia/cuda:12.1.0-runtime-ubuntu22.04";       WHEEL_TAG="cu121" ;;
      5) BASE_IMAGE="nvidia/cuda:11.8.0-runtime-ubuntu22.04";       WHEEL_TAG="cu118" ;;
      *) echo "Invalid choice"; exit 1 ;;
    esac
    set_env_var "CUDA_BASE_IMAGE" "${BASE_IMAGE}"
    set_env_var "CUDA_WHEEL_TAG" "${WHEEL_TAG}"
    echo ""
    echo "CUDA_BASE_IMAGE / CUDA_WHEEL_TAG written to .env (everything else in"
    echo "that file, including your ngrok token, was left as-is)."
    echo "NOTE: only CUDA 12.4 / cu122 (option 1) is validated against this project."
    echo "Other versions use prebuilt wheels published by the llama-cpp-python"
    echo "project for the same pinned version — they should work, but haven't been"
    echo "tested here. If the build fails, it likely means that wheel combo isn't"
    echo "published; try the next closest CUDA version."
    echo ""
    echo "Run this to start:"
    echo "  docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up --build"
    ;;
  2)
    echo ""
    echo "AMD GPU support isn't built yet — falling back to CPU-only mode."
    echo "(ROCm support is planned for a future pass.)"
    echo ""
    echo "Run this to start:"
    echo "  docker compose -f docker-compose.yml -f docker-compose.cpu.yml up --build"
    ;;
  3)
    echo ""
    echo "Run this to start:"
    echo "  docker compose -f docker-compose.yml -f docker-compose.cpu.yml up --build"
    ;;
  4)
    echo ""
    echo "Using the existing pinned dev config — no changes needed."
    echo "Run this to start (same as always):"
    echo "  docker compose up --build"
    ;;
  *)
    echo "Invalid choice"; exit 1 ;;
esac
