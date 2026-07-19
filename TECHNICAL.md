# Synpax — Technical Deep Dive & Post-Mortem

This document serves as a comprehensive technical breakdown of the Synpax application, outlining the architecture, the deterministic routing engine, and a post-mortem of the bugs and edge-cases encountered (and resolved) during development.

---

## 1. System Architecture & Flow

Synpax employs a strictly decoupled architecture, separating **probabilistic inference** (the AI) from **deterministic business logic** (the routing rules). 

### 1.1 The Frontend (Vue.js SPA)
- **Zero-Build Architecture**: The frontend is a vanilla Single Page Application (SPA) built using Vue.js imported via CDN. No Node.js, Webpack, or Vite compilation is required.
- **Hash Routing**: Uses `window.location.hash` (e.g., `#/dashboard`, `#/upload`) for instant, client-side navigation without triggering full page reloads.
- **Stateless Backend Integration**: Because the backend is entirely stateless (no SQL/NoSQL database), the frontend captures the JSON response from the API and saves it directly to the browser's `localStorage` (`synpax_claims`). This allows data persistence across browser sessions without infrastructure overhead.

### 1.2 The Backend (FastAPI & Groq)
- **API Gateway**: Exposes a unified `/api/process` POST endpoint that receives `multipart/form-data`.
- **Document Parsing**: Uses Python's `tempfile` to securely cache the uploaded PDF/TXT in memory, extracting raw text using `pdfplumber` before destroying the temporary file.
- **AI Extraction Agent**: Connects to the **Groq API** to perform high-speed inference using `llama-3.3-70b-versatile`. It injects the raw text and a strict system prompt, mandating a JSON output.
- **Data Validation**: Uses **Pydantic** (`schemas.py`) to enforce strict type-checking on the AI's output.
- **Deterministic Routing Engine**: A hard-coded cascading rule system that evaluates the validated Pydantic model and assigns the claim to the appropriate queue (Fast-Track, Manual Review, Investigation, or Specialist).

---

## 2. Technical Challenges & Bug Resolutions

Building an AI-augmented system introduces unique challenges, particularly when interfacing a probabilistic LLM with strict, typed Python backend systems. Below is a detailed record of the primary bugs encountered during development and how they were resolved.

### Bug 1: Decommissioned LLM Model Errors
**Issue:** 
When the backend attempted to generate completions, the Groq API threw a `404 / 400` error stating that `llama3-70b-8192` was decommissioned. 
**Resolution:** 
We updated the model string in `services/extraction_agent.py` to point to Groq's newest and most capable production model: `llama-3.3-70b-versatile`. 

### Bug 2: Conversational "Filler" Breaking JSON Parsing
**Issue:** 
Large Language Models, even when prompted to return *only* JSON, often output conversational filler such as: 
`Here is the extracted data in the requested JSON format: ```json { ... } ``` Note that some fields are null...`
Because the Python backend was using a naive `.startswith("```")` stripping method, it failed to isolate the JSON block, causing `json.loads()` to crash with a `JSONDecodeError: Expecting value: line 1 column 1 (char 0)`.
**Resolution:** 
We implemented a robust Regular Expression (Regex) parser in `extraction_agent.py`. The backend now uses `re.search(r'```(?:json)?(.*?)```', content, re.DOTALL)` to intelligently hunt down the JSON block regardless of surrounding conversational text. A secondary fallback was also added to extract substrings between the first `{` and last `}`.

### Bug 3: Pydantic Strict Type Validation Failures on Empty Documents
**Issue:** 
When processing the `claim_empty.txt` or `claim_half_filled.txt` samples, the LLM correctly identified that certain data was missing and returned `null` for fields like the vehicle ID or involved party names. However, `schemas.py` defined these fields as strict strings (e.g., `name: str`). Pydantic immediately rejected the `null` values with `Input should be a valid string [type=string_type, input_value=None]`.
**Resolution:** 
We refactored `models/schemas.py` to utilize Python's `typing.Optional`. By changing strict fields to `name: Optional[str] = None` and `location: Optional[Any] = Field(...)`, we allowed Pydantic to gracefully accept empty values. The routing engine was then able to catch these missing fields and route the claims to `MANUAL_REVIEW`.

### Bug 4: Local Server Port Conflicts (Zombie Processes)
**Issue:** 
During local development, attempting to restart the server resulted in the new changes not being reflected, or the server failing to bind to port `8000`. This occurred because previous `gunicorn` or `python` instances were still running in the background.
**Resolution:** 
Instead of repeatedly trying to start the server, we ran `kill -9 $(lsof -t -i:8000)` to aggressively terminate any zombie processes holding the port. We then switched to running the app via `python app.py`, which utilizes Uvicorn's `StatReload` to automatically hot-reload the server upon code changes, eliminating the need for manual restarts.

### Bug 5: Render Deployment "Not Found" Browser Caching
**Issue:** 
After successfully deploying the application to Render (`synapx-e1cy.onrender.com`), navigating to the dashboard briefly resulted in a plain text `Not Found` error. 
**Resolution:** 
Diagnostic tests via `curl` against the production URL confirmed the server was returning a `HTTP 200 OK` with the correct HTML payload. The issue was isolated to aggressive browser caching; the browser had cached an early 404 response generated while the Render container was still building. A hard refresh (`Cmd+Shift+R` / `Ctrl+F5`) immediately cleared the cache and loaded the application perfectly.

---

## 3. Conclusion

The final iteration of Synpax effectively solves the core challenge of AI data extraction: **handling unpredictability**. 
By implementing Regex-based JSON extraction and highly forgiving Pydantic schemas (`Optional[Any]`), the backend acts as a strict firewall that sanitizes unpredictable LLM outputs before they ever reach the deterministic routing engine. The result is a highly stable, stateless architecture capable of being deployed anywhere with minimal overhead.
