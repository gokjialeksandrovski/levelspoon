from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    """Session-scoped: the module-scoped `golden` fixture depends on it,
    and pytest forbids a broader-scoped fixture requesting a narrower one."""
    return REPO_ROOT / "fixtures"
