"""Fixed settings for the purchase-request slice (task 0001).

These are constants on purpose: no ``.env`` files and no environment lookups.
"""

from dataclasses import dataclass

SERVICE_NAME = "procureflow-api"
SERVICE_VERSION = "0.1.0"
STORAGE_MODE = "in_memory_dev"


@dataclass(frozen=True)
class Settings:
    max_body_bytes: int = 16384
    handler_timeout_seconds: float = 2.0
    backoff_base_seconds: float = 0.5
    backoff_factor: float = 2.0
    backoff_cap_seconds: float = 30.0
    max_attempts: int = 5
    dispatcher_poll_seconds: float = 0.25
    # Not secrets: the address the dev server is documented to bind to.
    host: str = "127.0.0.1"
    port: int = 8000
