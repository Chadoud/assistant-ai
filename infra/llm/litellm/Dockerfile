# LiteLLM gateway with Pillow for Ollama vision (moondream) image conversion.
ARG LITELLM_BASE=ghcr.io/berriai/litellm:main-latest
FROM ${LITELLM_BASE}

USER root
RUN /app/.venv/bin/python -m ensurepip --upgrade \
 && /app/.venv/bin/python -m pip install --no-cache-dir "Pillow>=10.0.0"
