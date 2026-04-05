FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y \
    libpq-dev \
    build-essential \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Build context is the repo root
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy only the runtime data the backend needs (not training datasets)
COPY model/habakkuk/ ./model/habakkuk/
COPY data/era5_climate_lookup_summarized.csv ./data/era5_climate_lookup_summarized.csv
COPY data/processed/solar.csv ./data/processed/solar.csv

WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
