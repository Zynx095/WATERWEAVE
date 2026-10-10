"""FastAPI application for the WATERWEAVE web frontend."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from waterweave.api import service
from waterweave.api.presets import PRESETS
from waterweave.api.schemas import EvaluateRequest, ModelRequest, SolveRequest
from waterweave.formulation import build_model


def create_app() -> FastAPI:
    app = FastAPI(
        title="WATERWEAVE API",
        version="0.1.0",
        description="Thin HTTP layer over the WATERWEAVE optimisation engine and data pipeline.",
    )

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

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unknown_api(rest: str) -> None:
        raise HTTPException(status_code=404, detail=f"Unknown API route: /api/{rest}")

    return app


app = create_app()
