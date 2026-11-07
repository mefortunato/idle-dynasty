# syntax=docker/dockerfile:1
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STATIC_DIR=/srv/static \
    UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PATH="/srv/.venv/bin:$PATH"
WORKDIR /srv
# Install locked runtime deps only (no dev group) into /srv/.venv, using the image's Python.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-cache
COPY backend/app ./app
COPY --from=frontend /frontend/build /srv/static
RUN useradd --system --uid 10001 --no-create-home app
USER app
EXPOSE 8080
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers
