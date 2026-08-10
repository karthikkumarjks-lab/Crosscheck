# Development Rules

Binding for every sprint, every session, every contributor (human or Claude
Code). If a change conflicts with these, stop and raise it rather than
proceeding.

## Design Principles

1. Modular architecture.
2. Clear separation of concerns.
3. Avoid unnecessary complexity.
4. Prefer maintainable solutions over clever ones.
5. Avoid premature AI/LLM usage where deterministic logic is sufficient.
6. Use AI where semantic understanding provides real value — and be able to
   articulate why deterministic logic wasn't enough.
7. Minimize unnecessary API/model calls.
8. Minimize token consumption.
9. Do not duplicate functionality — search before building.
10. Write tests for important behaviour.
11. Security must be considered from the beginning, not retrofitted.
12. Configuration must use environment variables/secrets — never hard-coded.
13. Never hard-code credentials.
14. Do not introduce paid third-party services without explicit user
    approval.
15. Prefer open-source/free components where practical.
16. Every major architectural decision must be documented (in
    `docs/DECISIONS.md`).
17. Do not make assumptions about future modules that unnecessarily
    constrain the architecture.

## Workflow (mandatory, every sprint)

```
Product requirement → Architecture → Sprint definition → Implementation →
Tests → Review → Documentation → Git commit → Next sprint
```

Do not combine multiple large features into one uncontrolled implementation.
Each sprint must define, up front:

- Objective
- Scope
- Out of scope
- Technical tasks
- Acceptance criteria
- Test plan
- Completion status

See `memory/CURRENT_SPRINT.md` for the live template in use.

## Testing

- Important behaviour (anything a Finding, a comparison result, or a
  notification depends on) needs a test. "Important" errs toward
  "yes" — silent regressions in mismatch detection are the core failure
  mode this product exists to prevent.
- Tests are part of a sprint's definition of done, not a follow-up task.

## Security

- No secrets, credentials, tokens, or API keys committed to the repo, ever
  — including in example/test files.
- All config via environment variables or a secrets manager.
- Treat crawled/external content as untrusted input.
- Consider security implications of any new dependency or service before
  adding it.

## Dependencies & Services

- No new dependency without a concrete, current-sprint reason for it.
- No paid third-party service without explicit user approval — this
  includes AI/LLM API providers, hosting, crawling services, etc.
- Prefer free/open-source components where they meet the requirement.
- Do not install services (databases, queues, etc.) speculatively ahead of
  the sprint that needs them.

## Documentation & Memory Discipline

- Major architectural decisions go in `docs/DECISIONS.md` when made — not
  left implicit in code or chat history.
- `memory/CURRENT_STATE.md`, `memory/CURRENT_SPRINT.md`,
  `memory/NEXT_SESSION.md`, and `memory/AI_PROJECT_STATE.json` are updated
  at the end of any meaningful unit of work, not just at "session end."
- Documentation should be concise but sufficient — optimized for a future
  session reading only what it needs (see `CLAUDE.md` token-efficiency
  rules), not for exhaustive completeness.

## Scope Discipline

- Do not implement future modules ahead of their phase (see
  `docs/ROADMAP.md`).
- Do not build the full rule engine before a sprint scopes it — Sprint 0
  only documents its boundary (`docs/ARCHITECTURE.md`).
- When an instruction would create unnecessary technical debt or lock in an
  architecture prematurely, stop and explain alternatives before
  implementing, per the escalation rule in `CLAUDE.md`.
