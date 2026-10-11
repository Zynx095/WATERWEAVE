"""WATERWEAVE: Quantum Water-Allocation Decision Support Dashboard.

Own the root app.py for the Streamlit dashboard prototype.
Compares QAOA quantum heuristic against greedy and exact classical baselines
on transparent synthetic water-allocation scenarios.
"""

from __future__ import annotations

import streamlit as st

from waterweave.ui.adapter import (
    evaluate_allocation_safe,
    execute_solvers,
    get_default_scenario,
    get_engine_status,
)
from waterweave.ui.components import (
    render_allocation_breakdown,
    render_comparison_view,
    render_diagnostics,
    render_header_and_disclaimer,
    render_kpi_metrics,
    render_scenario_controls,
    render_tradeoffs_and_qaoa_explainer,
)
from waterweave.ui.styles import inject_custom_styles
from waterweave.data import registry, ScenarioBuilder

# Page configuration
st.set_page_config(
    page_title="WATERWEAVE | Quantum Water Allocation",
    page_icon="💧",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inject styling
inject_custom_styles()

# Initialize session state
if "scenario" not in st.session_state:
    st.session_state.scenario = get_default_scenario()

if "results" not in st.session_state or "errors" not in st.session_state:
    results, errors, is_live = execute_solvers(st.session_state.scenario, include_qaoa=True)
    st.session_state.results = results
    st.session_state.errors = errors
    st.session_state.is_live = is_live

# Top visual hierarchy and disclaimers
render_header_and_disclaimer()

# Sidebar: Controls & Quick Actions
with st.sidebar:
    st.image("https://raw.githubusercontent.com/qiskit-community/qiskit-nature/main/docs/_static/qiskit_logo.png", width=60)
    st.title("WATERWEAVE")
    st.caption("Quantum Water Allocation Decision Support")
    st.markdown("---")

    status = get_engine_status()
    st.markdown("##### 🔌 Engine Status")
    if status["has_optimization"] and status["optimization_import_error"] is None:
        st.success("🟢 Live Solver Engine")
    else:
        st.info("ℹ️ UI Demo Mode (Solvers Pending)")

    st.markdown("---")
    st.markdown("##### ⚡ Quick Actions")
    if st.button("🔄 Reset to Default Scenario", use_container_width=True):
        st.session_state.scenario = get_default_scenario()
        st.session_state.observations = None
        with st.spinner("Executing allocation models..."):
            results, errors, is_live = execute_solvers(st.session_state.scenario, include_qaoa=True)
            st.session_state.results = results
            st.session_state.errors = errors
            st.session_state.is_live = is_live
        st.rerun()

    if st.button("🌍 Use Live/Data-Driven Scenario", use_container_width=True):
        with st.spinner("Fetching municipal & weather data..."):
            observations = registry.fetch_all()
            st.session_state.observations = observations
            builder = ScenarioBuilder()
            st.session_state.scenario = builder.build(observations)
            results, errors, is_live = execute_solvers(st.session_state.scenario, include_qaoa=True)
            st.session_state.results = results
            st.session_state.errors = errors
            st.session_state.is_live = is_live
        st.rerun()

    st.markdown("---")
    st.markdown(
        """
        <div style="font-size: 0.8rem; color: #64748B;">
            <b>Project Rules Notice:</b><br/>
            All data shown is strictly synthetic. Do not use for physical water-pipe operation.
        </div>
        """,
        unsafe_allow_html=True,
    )

def render_data_sources():
    observations = st.session_state.get("observations")
    if not observations:
        st.warning("⚠️ **SYNTHETIC DATA MODE**: The current scenario uses hardcoded demonstration inputs. It does not reflect real-world measurements.")
        return
        
    valid_obs = [o for o in observations if not o.quality.missing]
    missing_obs = [o for o in observations if o.quality.missing]
    live_obs = [o for o in valid_obs if o.quality.status == "VERIFIED_LIVE"]
    
    st.info("🌍 **DATA-DRIVEN MODE**: Scenario built from municipal and environmental data sources.")
    cols = st.columns(4)
    cols[0].metric("Valid Observations", len(valid_obs))
    cols[1].metric("Missing/Errors", len(missing_obs))
    cols[2].metric("Live Sources", len(live_obs))
    
    last_retrieval = max((o.retrieval_timestamp for o in valid_obs), default=None)
    if last_retrieval:
        cols[3].metric("Last Retrieval", last_retrieval.strftime("%H:%M:%S UTC"))
        
    with st.expander("Data Provenance & Freshness Details"):
        for obs in observations:
            status_icon = "✅" if not obs.quality.missing else "❌"
            if obs.quality.status == "VERIFIED_LIVE":
                status_icon = "🟢"
            age_str = "Unknown"
            if obs.source_timestamp:
                age_delta = obs.retrieval_timestamp - obs.source_timestamp
                age_str = f"{age_delta.total_seconds() / 60:.1f} mins"
            st.markdown(f"{status_icon} **{obs.provider_id}** ({obs.dataset_id}): {obs.variable} = {obs.value} {obs.unit} (Age: {age_str}) - {obs.quality.status}")
            if obs.quality.error_details:
                st.caption(f"Error: {obs.quality.error_details}")

render_data_sources()

# Main Navigation Tabs
tab_overview, tab_matrix, tab_scenario, tab_qaoa, tab_diag = st.tabs(
    [
        "📊 Multi-Solver Comparison",
        "🗺️ Allocation Schedules",
        "🎛️ Scenario Studio",
        "🔬 Quantum (QAOA) Deep-Dive",
        "🛠️ System Diagnostics",
    ]
)

with tab_scenario:
    new_scenario, include_qaoa, val_errors = render_scenario_controls(st.session_state.scenario)
    if st.button("🚀 Re-run Solvers with Updated Scenario", type="primary", use_container_width=True):
        st.session_state.scenario = new_scenario
        with st.spinner("Running quantum and classical solvers..."):
            results, errors, is_live = execute_solvers(
                new_scenario, include_qaoa=include_qaoa
            )
            st.session_state.results = results
            st.session_state.errors = errors
            st.session_state.is_live = is_live
        st.success("Allocation evaluation complete!")
        st.rerun()

with tab_overview:
    # Key Performance Metrics
    render_kpi_metrics(st.session_state.results)
    st.markdown("---")
    # Multi-Solver Comparison View
    render_comparison_view(
        st.session_state.scenario,
        st.session_state.results,
        st.session_state.errors,
    )

with tab_matrix:
    render_allocation_breakdown(st.session_state.scenario, st.session_state.results)

with tab_qaoa:
    render_tradeoffs_and_qaoa_explainer(st.session_state.scenario, st.session_state.results)

with tab_diag:
    render_diagnostics(get_engine_status(), st.session_state.errors)
