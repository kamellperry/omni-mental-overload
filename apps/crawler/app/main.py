from fastapi import FastAPI

from .api.crawl import router as crawl_router
from .io.db import create_pool

app = FastAPI(title="Crawler")
app.include_router(crawl_router)


@app.on_event("startup")
async def startup():
    app.state.pool = await create_pool()


@app.on_event("shutdown")
async def shutdown():
    await app.state.pool.close()
