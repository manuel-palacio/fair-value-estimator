from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from scraper import parse_listing

app = FastAPI(title="Bovärdare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/parse")
def parse(url: str = Query(..., description="Fastighetsbyran listing URL")):
    try:
        return parse_listing(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch listing: {e}")


@app.get("/api/health")
def health():
    return {"ok": True}
