from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

VALID_RANKS = set("AKQJT98765432")


class PreflopRangePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    spot: str = Field(min_length=1, max_length=80)
    stack_bb: int = Field(gt=0, le=500)
    actions: dict[str, dict[str, float]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_actions(self) -> "PreflopRangePayload":
        for combo, action_map in self.actions.items():
            if not _is_valid_hand_key(combo):
                raise ValueError(f"Invalid hand key: {combo}")
            if not action_map:
                raise ValueError(f"{combo} must contain at least one action")
            total = 0.0
            for action, frequency in action_map.items():
                if not action.strip():
                    raise ValueError(f"{combo} contains a blank action")
                if frequency < 0 or frequency > 1:
                    raise ValueError(f"{combo}:{action} frequency must be between 0 and 1")
                total += frequency
            if abs(total - 1.0) > 0.000001:
                raise ValueError(f"{combo} action frequencies must sum to 1")
        return self


def parse_preflop_range(payload: dict) -> PreflopRangePayload:
    return PreflopRangePayload.model_validate(payload)


def _is_valid_hand_key(combo: str) -> bool:
    if len(combo) == 2:
        return combo[0] == combo[1] and combo[0] in VALID_RANKS
    if len(combo) == 3:
        return combo[0] != combo[1] and combo[0] in VALID_RANKS and combo[1] in VALID_RANKS and combo[2] in {"s", "o"}
    return False
