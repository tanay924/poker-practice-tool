from __future__ import annotations


class SolverError(Exception):
    """Base class for solver integration failures."""


class UnsupportedAnalysisError(SolverError):
    """Raised when a hand or environment cannot be solved accurately."""


class SolverExecutionError(SolverError):
    """Raised when a configured solver fails while executing."""
