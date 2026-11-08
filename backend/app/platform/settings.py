"""Fixed settings for the purchase-request slice (task 0001).

These are constants on purpose: no ``.env`` files and no environment lookups.
"""

from dataclasses import dataclass

SERVICE_NAME = "procureflow-api"
SERVICE_VERSION = "0.1.0"
STORAGE_MODE = "in_memory_dev"  # the default, and the only value contract v1 knows
# Contract v1.1 (contracts/purchase-request-v1.1/) adds "postgres". Nothing else is ever valid.
STORAGE_MODES = ("in_memory_dev", "postgres")


@dataclass(frozen=True)
class Settings:
    max_body_bytes: int = 16384
    handler_timeout_seconds: float = 2.0
    backoff_base_seconds: float = 0.5
    backoff_factor: float = 2.0
    backoff_cap_seconds: float = 30.0
    max_attempts: int = 5
    dispatcher_poll_seconds: float = 0.25
