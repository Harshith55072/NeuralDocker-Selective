FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir requests

COPY ngrok_monitor.py .

CMD ["python", "ngrok_monitor.py", "--api-url", "http://ngrok:4040/api/tunnels", "--interval", "30", "--output", "/tmp/ngrok_url.txt"]
