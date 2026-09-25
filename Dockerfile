FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot_ejecutor.py .
ENV PYTHONUNBUFFERED=1
CMD ["python", "bot_ejecutor.py"]
