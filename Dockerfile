FROM python:3.11-slim

# Install Wine, Xvfb, curl, and process tools for MT5 headless support
RUN apt-get update && apt-get install -y --no-install-recommends \
    wine \
    xvfb \
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

CMD ["python", "bot_ejecutor.py"]
