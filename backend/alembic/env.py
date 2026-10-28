from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import require_postgres_url
from app.models import BankSavingsProduct, PreferentialCondition, ReferenceItem, SavingsPolicy


config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# 모델 import가 Alembic 메타데이터에 반영되도록 명시적으로 참조한다.
_MODELS = (BankSavingsProduct, PreferentialCondition, ReferenceItem, SavingsPolicy)


def get_database_url() -> str:
    return require_postgres_url(get_settings().database_url)


def run_migrations_offline() -> None:
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        with connectable.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
            with context.begin_transaction():
                context.run_migrations()
    except SQLAlchemyError:
        raise RuntimeError(
            "PostgreSQL 마이그레이션 연결에 실패했습니다. backend/.env의 Session pooler 정보를 확인해 주세요."
        ) from None
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
