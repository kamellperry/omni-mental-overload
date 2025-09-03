import logging
import sys
from datetime import datetime
from typing import Any, Dict
import json
from fastapi import FastAPI

from .api.crawl import router as crawl_router
from .io.db import create_pool

class _JsonLineFormatter(logging.Formatter):
    """Minimal JSONL formatter for our structured logs."""
    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        payload: Dict[str, Any]
        msg = record.msg
        if isinstance(msg, dict):
            payload = dict(msg)
        else:
            payload = {"message": str(msg)}
        payload.setdefault("level", record.levelname.lower())
        payload.setdefault("logger", record.name)
        payload.setdefault("time", datetime.utcnow().isoformat(timespec="seconds") + "Z")
        return json.dumps(payload, default=str)


def _setup_crawler_logger() -> None:
    logger = logging.getLogger("crawler")
    logger.setLevel(logging.INFO)
    # Avoid duplicate handlers on reload
    if not any(getattr(h, "_omni_handler", False) for h in logger.handlers):
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setFormatter(_JsonLineFormatter())
        setattr(handler, "_omni_handler", True)
        logger.addHandler(handler)
    logger.propagate = False

_setup_crawler_logger()

app = FastAPI(title="Crawler")
app.include_router(crawl_router)


@app.on_event("startup")
async def startup():
    app.state.pool = await create_pool()


@app.on_event("shutdown")
async def shutdown():
    await app.state.pool.close()
