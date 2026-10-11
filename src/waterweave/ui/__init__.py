"""UI modules for WATERWEAVE dashboard."""

from waterweave.ui.adapter import (
    evaluate_allocation_safe,
    execute_solvers,
    get_default_scenario,
    get_engine_status,
)
from waterweave.ui.components import (
    get_qaoa_circuit_for_inspector,
    render_allocation_breakdown,
    render_comparison_view,
    render_diagnostics,
    render_header_and_disclaimer,
    render_kpi_metrics,
    render_qaoa_circuit_inspector,
    render_quantum_pipeline_explainer,
    render_result_traceability,
    render_scenario_controls,
    render_tradeoffs_and_qaoa_explainer,
)
from waterweave.ui.styles import inject_custom_styles

__all__ = [
    "evaluate_allocation_safe",
    "execute_solvers",
    "get_default_scenario",
    "get_engine_status",
    "get_qaoa_circuit_for_inspector",
    "render_allocation_breakdown",
    "render_comparison_view",
    "render_diagnostics",
    "render_header_and_disclaimer",
    "render_kpi_metrics",
    "render_qaoa_circuit_inspector",
    "render_quantum_pipeline_explainer",
    "render_result_traceability",
    "render_scenario_controls",
    "render_tradeoffs_and_qaoa_explainer",
    "inject_custom_styles",
]
