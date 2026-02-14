FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Railway injects PORT at runtime — uvicorn must bind to it.
# Shell form so $PORT is expanded from the environment.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
