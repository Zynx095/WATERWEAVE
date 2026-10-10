"""Automated headless testing for the Streamlit dashboard app.py."""

from pathlib import Path
import pytest
from streamlit.testing.v1 import AppTest

APP_PATH = str(Path(__file__).resolve().parent.parent / "app.py")


def test_app_loads_and_executes_cleanly():
    """Verify that app.py runs headlessly from top to bottom without exceptions."""
    at = AppTest.from_file(APP_PATH, default_timeout=30)
    at.run()
    assert len(at.exception) == 0, f"App execution threw exceptions: {[e.value for e in at.exception]}"
    assert at.title[0].value == "WATERWEAVE"


def test_app_session_state_and_results():
    """Verify default session state initialization and solver execution in app.py."""
    at = AppTest.from_file(APP_PATH, default_timeout=30)
    at.run()
    assert "scenario" in at.session_state
    assert "results" in at.session_state
    results = at.session_state["results"]
    assert len(results) == 3
    solver_names = [r.solver_name for r in results]
    assert "Greedy (Priority-First)" in solver_names
    assert "Exact Classical (Optimal)" in solver_names
    assert "QAOA (Quantum Heuristic)" in solver_names
