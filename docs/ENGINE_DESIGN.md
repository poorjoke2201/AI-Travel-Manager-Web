# Engine design notes

This project uses a staged itinerary engine architecture.

## Runtime status

- The active trip generator includes a v2-style optimizer behind `ITINERARY_ENGINE=v2|shadow`.
- The legacy deterministic + Gemini pipeline remains the default fallback so the app does not regress.
- The optimizer is intentionally bounded and deterministic for compatibility.

## Config-driven scoring

The engine relies on config files for category behaviour and scoring weights rather than hard-coded values. The scoring weights and scheduling priors live in the `config/` directory and are read by the optimizer and planning helpers.

## Geoapify-first provider policy

The geocoding provider order is Geoapify -> LocationIQ -> city fallback. This keeps the runtime aligned with the design requirement while preserving a stable fallback when a provider is unavailable.

## Scope note

This repo does not yet include the full Python OR-Tools planner, Docker deployment, or the advanced evaluator described in the design prompt. The current codebase implements the runtime feature-flag bridge and the first deterministic v2 optimizer layer, while leaving the more advanced planner components as future work.
