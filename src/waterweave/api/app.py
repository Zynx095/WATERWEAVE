"""FastAPI application for the WATERWEAVE web frontend."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from waterweave.api import service
from waterweave.api.presets import PRESETS
from waterweave.api.schemas import EvaluateRequest, ModelRequest, SolveRequest
from waterweave.data import clear_cache
from waterweave.formulation import build_model

_NOT_BUILT_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>WATERWEAVE API</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; line-height: 1.5">
<h1>WATERWEAVE API is running</h1>
<p>The web frontend has not been built, so there is nothing to show here yet.</p>
<p>Build it once with <code>cd frontend &amp;&amp; npm ci &amp;&amp; npm run build</code>, then restart
<code>python -m waterweave.api</code>. For development, run <code>npm run dev</code> in
<code>frontend/</code> instead.</p>
<p>The API itself is available under <a href="/api/health">/api/health</a>.</p>
</body></html>"""


# The built frontend loads only its own scripts, styles and fonts and talks
# only to this server, so the policy can be strict. Inline styles are allowed
# because React sets element styles at run time.
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
        "frame-ancestors 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


def _frontend_dist() -> Path:
    return service.repo_root() / "frontend" / "dist"


def create_app() -> FastAPI:
    app = FastAPI(
        title="WATERWEAVE API",
        version="0.1.0",
        description="Thin HTTP layer over the WATERWEAVE optimisation engine and data pipeline.",
    )

    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        problems = []
        for err in exc.errors():
            location = ".".join(str(part) for part in err.get("loc", ()) if part != "body")
            message = str(err.get("msg", "invalid value")).removeprefix("Value error, ")
            problems.append({"field": location, "message": message})
        return JSONResponse(
            status_code=422,
            content={"detail": "The request is not valid.", "problems": problems},
        )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return service.json_safe(
            {
                "status": "ok",
                "server_time": service.utc_now(),
                "engine": service.engine_info(),
                "offline_mode": service.offline_mode(),
                "frontend_built": (_frontend_dist() / "index.html").is_file(),
            }
        )

    @app.get("/api/presets")
    def presets() -> list[dict[str, Any]]:
        return [
            {
                "id": p.id,
                "label": p.label,
                "summary": p.summary,
                "provenance": p.provenance,
                "scenario": service.scenario_to_dict(p.build()),
            }
            for p in PRESETS.values()
        ]

    @app.post("/api/solve")
    def solve(request: SolveRequest) -> dict[str, Any]:
        scenario = service.scenario_from_input(request.scenario)
        try:
            return service.solve(scenario, request.settings)
        except service.SolverBusyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/api/model")
    def model(request: ModelRequest) -> dict[str, Any]:
        scenario = service.scenario_from_input(request.scenario)
        built = build_model(
            scenario,
            fairness_weight=request.fairness_weight,
            penalty_weight=request.penalty_weight,
        )
        return service.json_safe(service.model_details(built))

    @app.post("/api/evaluate")
    def evaluate(request: EvaluateRequest) -> dict[str, Any]:
        scenario = service.scenario_from_input(request.scenario)
        return service.evaluate(
            scenario, request.allocation, request.fairness_weight, request.penalty_weight
        )

    @app.get("/api/data-sources")
    def data_sources(
        live: bool = Query(True, description="Contact network providers (Open-Meteo)."),
        refresh: bool = Query(False, description="Clear the providers' 5-minute cache first."),
    ) -> dict[str, Any]:
        if refresh:
            clear_cache()
        return service.data_sources(live=live)

    @app.get("/api/benchmark")
    def benchmark() -> dict[str, Any]:
        payload = service.load_benchmark()
        if payload is None:
            raise HTTPException(
                status_code=404,
                detail="No recorded benchmark found in benchmark_results/. Run python scripts/benchmark.py.",
            )
        return payload

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unknown_api(rest: str) -> None:
        raise HTTPException(status_code=404, detail=f"Unknown API route: /api/{rest}")

    dist = _frontend_dist()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{rest:path}", include_in_schema=False)
    def frontend(rest: str):
        index = dist / "index.html"
        if not index.is_file():
            return HTMLResponse(_NOT_BUILT_PAGE)
        candidate = (dist / rest).resolve()
        # Serve real files from dist (favicon, fonts); everything else is a
        # client-side route and gets index.html.
        if rest and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)

    return app


app = create_app()
