FROM python:3.11-slim

# System dependencies for PDF parsing (unstructured[pdf] needs poppler,
# and its OpenCV dependency needs libGL/libglib at import time)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpoppler-cpp-dev \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the HuggingFace sentence-transformers model into the image.
# Avoids a ~90MB download on first free-tier request in production.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy application code
COPY . .

# Directories that must exist at runtime (chroma_db is a Railway volume mount)
RUN mkdir -p logs chroma_db

EXPOSE 8000

# Health check — Railway and Docker both use this. Respects PORT override.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\", \"8000\")}/health')" || exit 1

# Single worker: ChromaDB is file-based and not safe for concurrent writes
# from multiple workers. --timeout-keep-alive 120 keeps SSE streams alive past
# Railway's 60s default proxy timeout.
CMD ["sh", "-c", "python -m uvicorn api.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 120"]
