"""HTTP API for the WATERWEAVE web frontend.

A thin layer over the existing engine: every number it returns comes from
``waterweave.optimization``, ``waterweave.metrics``, ``waterweave.formulation``
or ``waterweave.data``. Run it with ``python -m waterweave.api``.
"""

from waterweave.api.app import create_app

__all__ = ["create_app"]
