# Nutze ein schlankes Python-Image
FROM python:3.11-slim

# Umgebungsvariablen setzen
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV LIVEKIT_HTTP_PORT=7860

# System-Abhängigkeiten installieren (wichtig für Audio/Opus/OpenAI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code kopieren
COPY . .

# Hugging Face benötigt Port 7860
EXPOSE 7860

# Startbefehl für den Agenten
# Wir nutzen "start" statt "dev" für den Server-Betrieb
ENTRYPOINT ["python", "agent.py", "start"]
