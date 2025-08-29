# Monorepo install/setup tasks
FRONTEND_DIR := apps/api
BACKEND_DIR := apps/crawler

.PHONY: install.frontend install.backend setup

# Install frontend dependencies using bun
install.frontend:
	cd $(FRONTEND_DIR) && bun install

# Install backend deps with uv and create venv in the crawler directory
# - Creates a local .venv in apps/crawler
# - Installs project and dev dependencies from pyproject.toml
install.backend:
	cd $(BACKEND_DIR) && uv venv .venv && UV_VENV_IN_PROJECT=1 uv sync --dev

# Setup all: frontend + backend
setup: install.frontend install.backend
	@echo "Setup complete. Frontend and backend dependencies installed."
