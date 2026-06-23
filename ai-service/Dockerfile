FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1

WORKDIR /app

RUN python3 -m pip install --no-cache-dir --upgrade pip

# cu122 wheel v0.3.2 was installing CPU-only build despite the index URL.
# v0.2.90 cu122 wheels are confirmed GPU-enabled and stable on WSL2.
RUN python3 -m pip install --no-cache-dir \
    "llama-cpp-python==0.2.90" \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu122 \
    --prefer-binary

COPY requirements.txt .
RUN sed -i '/llama-cpp-python/d' requirements.txt && \
    python3 -m pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python3", "main.py"]