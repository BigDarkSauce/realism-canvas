FROM python:3.12-slim

# WeasyPrint native dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev libcairo2 fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

ENV PORT=8080
EXPOSE 8080

CMD ["gunicorn", "app:app", "-b", "0.0.0.0:8080", "-w", "2", "--timeout", "120"]
