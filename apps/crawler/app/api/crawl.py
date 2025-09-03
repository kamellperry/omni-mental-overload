import logging
from typing import Any, Dict
from fastapi import APIRouter, BackgroundTasks, Request

from ..models.crawl import CrawlRequest
from ..core.crawl_service import run_crawl

logger = logging.getLogger("crawler")
router = APIRouter()


def _sanitize_cfg(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Shallow‑copy cfg and redact sensitive headers for logging."""
    out: Dict[str, Any] = dict(cfg)
    headers = out.get("headers")
    if isinstance(headers, dict):
        redacted: Dict[str, Any] = {}
        for k, v in headers.items():
            if isinstance(k, str) and k.lower() in {"cookie", "authorization", "set-cookie"}:
                redacted[k] = "***"
            else:
                redacted[k] = v
        out["headers"] = redacted
    return out


@router.get("/health")
async def health(request: Request):
    # Deep check DB connectivity
    try:
        pool = request.app.state.pool
        async with pool.acquire() as conn:
            _ = await conn.fetchval('SELECT 1')
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/crawl/jobs")
async def start_crawl(req: CrawlRequest, tasks: BackgroundTasks, request: Request):
    pool = request.app.state.pool
    logger.info({
        "event": "crawl.accepted",
        "seed_type": req.seed_type,
        "seed_value": req.seed_value,
        "cfg": _sanitize_cfg(req.crawl_config.model_dump()),
    })
    tasks.add_task(run_crawl, req.seed_type, req.seed_value, req.crawl_config, pool)
    return {"status": "queued"}
