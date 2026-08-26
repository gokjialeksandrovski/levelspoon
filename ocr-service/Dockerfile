FROM python:3.12-slim

# opencv (pulled in by paddlex) needs these even in headless mode
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir ".[ocr]"

# Bake the model into an image layer (spec §13.2). Without this, every
# deploy and restart begins by downloading ~133MB before serving a request.
RUN python -c "\
from paddleocr import PaddleOCR; \
PaddleOCR(lang='en', use_doc_orientation_classify=False, \
use_doc_unwarping=False, use_textline_orientation=False)"

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "per100_ocr.main:app", "--host", "0.0.0.0", "--port", "8000"]
