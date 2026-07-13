# VPS sort-worker — OCR, ffmpeg, full analyze pipeline
# Build from repo root:
#   docker build -f infra/llm/sort-worker/Dockerfile .

FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ara \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend

ENV PYTHONPATH=/app/backend
ENV SORT_WORKER_TMP_DIR=/tmp/exo-sort-worker
ENV OLLAMA_MODE=remote
ENV EXOSITES_REMOTE_LLM=1
ENV OLLAMA_HOST=http://litellm:4000

EXPOSE 8020

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8020/health || exit 1

CMD ["uvicorn", "sort_worker_vps:app", "--host", "0.0.0.0", "--port", "8020"]
