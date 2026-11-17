# AuraGen project overview

## Problem
Long forms can create avoidable interaction friction. Users may pause, click repeatedly, or encounter validation errors without receiving enough guidance.

## Proposed solution
AuraGen collects a small set of interaction counters, computes a transparent friction estimate, and switches the demonstration form into a guided wizard when the score crosses the threshold. A local language model can rewrite explanatory copy; deterministic fallback keeps the product usable without inference.

## Functional modules
1. Telemetry capture — hesitation, repeated-click and validation-error signals.
2. Friction engine — deterministic weighted score, bounded to 0–100.
3. Adaptation service — threshold/cooldown logic and safe AI/fallback generation.
4. UI renderer — allowlisted React form controls and preserved browser form state.
5. Operations — health/readiness endpoints, environment configuration and container packaging.

## Important boundaries
AI changes language only. It does not change business rules, field identifiers, field types, validation, or execute code. The score is an interaction-friction heuristic, not a medical or psychological assessment.

## Prototype versus production
This ZIP contains a local full-stack prototype. Authentication, database persistence, multi-tenancy, durable analytics, production rate limiting, formal accessibility conformance, cloud infrastructure and SLA validation remain future work.
