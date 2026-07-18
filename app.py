import os
import time
import tempfile
from collections import defaultdict
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

from services.document_parser import DocumentParser
from services.extraction_agent import ExtractionAgent
from services.routing_engine import RoutingEngine

load_dotenv()


# ===== Rate Limiter Middleware =====

class RateLimiter(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter per client IP.
    
    Limits:
      - /api/*  endpoints:  5 requests per 60 seconds
      - All other routes:  30 requests per 60 seconds
    """

    def __init__(self, app, api_limit: int = 5, general_limit: int = 30, window: int = 60):
        super().__init__(app)
        self.api_limit = api_limit
        self.general_limit = general_limit
        self.window = window  # seconds
        # Separate buckets: { ip: [timestamp, ...] }
        self._api_hits: dict[str, list[float]] = defaultdict(list)
        self._general_hits: dict[str, list[float]] = defaultdict(list)

    def _clean_and_check(self, bucket: dict, ip: str, limit: int) -> tuple[bool, int]:
        """Remove expired timestamps, check if under limit. Returns (allowed, remaining)."""
        now = time.time()
        cutoff = now - self.window
        # Prune old entries
        bucket[ip] = [t for t in bucket[ip] if t > cutoff]

        if len(bucket[ip]) >= limit:
            return False, 0

        bucket[ip].append(now)
        return True, limit - len(bucket[ip])

    async def dispatch(self, request: Request, call_next):
        # Resolve client IP (supports reverse proxies)
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not ip:
            ip = request.client.host if request.client else "unknown"

        path = request.url.path

        # Skip rate limiting for static assets
        if path.startswith("/static"):
            return await call_next(request)

        # Choose the right bucket
        if path.startswith("/api/"):
            allowed, remaining = self._clean_and_check(self._api_hits, ip, self.api_limit)
            limit = self.api_limit
        else:
            allowed, remaining = self._clean_and_check(self._general_hits, ip, self.general_limit)
            limit = self.general_limit

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={
                    "Retry-After": str(self.window),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response


# ===== App Setup =====

app = FastAPI(title="ClaimSense", description="Autonomous Insurance Claims Processing Agent")

# Apply rate limiter before anything else
app.add_middleware(RateLimiter)

app.mount("/static", StaticFiles(directory="static"), name="static")

parser = DocumentParser()
agent = ExtractionAgent()
router = RoutingEngine()


@app.get("/")
async def serve_dashboard():
    return FileResponse("static/index.html")


@app.post("/api/process")
async def process_claim(file: UploadFile = File(...)):
    """Process an uploaded PDF or TXT claim document."""
    allowed_extensions = [".pdf", ".txt"]
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Only PDF and TXT are accepted.")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    try:
        raw_text = parser.parse_file(tmp_path)
        extraction = agent.extract_claim_data(raw_text)
        final_output = router.evaluate(extraction)

        return final_output.model_dump()

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
