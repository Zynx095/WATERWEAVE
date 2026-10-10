"""Run the WATERWEAVE API (and the built frontend) with Uvicorn.

    python -m waterweave.api [--host 127.0.0.1] [--port 8000] [--offline]
"""

from __future__ import annotations

import argparse
import os


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Serve the WATERWEAVE API and web frontend.")
    parser.add_argument("--host", default="127.0.0.1", help="Interface to bind (default 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8000, help="Port (default 8000).")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Never contact network data providers (same as WATERWEAVE_OFFLINE=1).",
    )
    args = parser.parse_args(argv)
    if args.offline:
        os.environ["WATERWEAVE_OFFLINE"] = "1"

    import uvicorn

    print(f"WATERWEAVE: open http://{args.host}:{args.port}/ (Ctrl+C to stop)", flush=True)
    uvicorn.run("waterweave.api.app:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
