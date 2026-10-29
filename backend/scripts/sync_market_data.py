"""Fetch a validated market snapshot and atomically replace Supabase reference rows."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.init_db import upsert_investment_snapshot  # noqa: E402
from app.db.session import (  # noqa: E402
    DatabaseConfigurationError,
    DatabaseConnectionError,
    create_database_engine,
    create_session_factory,
    require_postgres_url,
    verify_database_connection,
)
from scripts.build_market_snapshot import build_snapshot  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without writing to PostgreSQL")
    args = parser.parse_args()

    try:
        snapshot = build_snapshot()
        assets = snapshot["assets"]
        source_date = assets[0]["source_date"]
        point_count = sum(len(asset["points"]) for asset in assets)
        if args.dry_run:
            print(f"Validation passed: {len(assets)} assets, {point_count} points, source date {source_date}")
            return 0

        database_url = require_postgres_url(get_settings().database_url)
        engine = create_database_engine(database_url)
        try:
            verify_database_connection(engine)
            session_factory = create_session_factory(engine)
            with session_factory.begin() as session:
                upsert_investment_snapshot(session, snapshot)
        finally:
            engine.dispose()
        print(f"Market sync completed: {len(assets)} assets, {point_count} points, source date {source_date}")
        return 0
    except (DatabaseConfigurationError, DatabaseConnectionError):
        print("Market sync failed: check the Supabase Session pooler database secret.", file=sys.stderr)
    except SQLAlchemyError:
        print("Market sync failed: PostgreSQL rejected the transaction; existing rows were preserved.", file=sys.stderr)
    except (OSError, RuntimeError, KeyError, TypeError, ValueError):
        print("Market sync failed: source data could not be fetched or validated; existing rows were preserved.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
