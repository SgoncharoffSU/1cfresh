#!/bin/bash
# Runs every time the Codespace starts (not just first create)

# Start FastAPI in background if .env exists
if [ -f "/workspaces/1Cfresh/.env" ]; then
  echo "Starting FastAPI..."
  cd /workspaces/1Cfresh
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
fi
