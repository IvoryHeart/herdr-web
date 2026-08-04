# Specification workflow

This repository uses an **immutable specification** workflow for non-trivial
changes. It borrows OpenSpec's useful requirement-and-scenario style, but keeps
the process intentionally small and entirely in this repository.

## Why this format

A reviewed specification is a contract between the requester and the agents
implementing it. Keeping it immutable makes later differences visible instead
of rewriting history to make a delivery look conformant. The implementation
summary is the factual record of what shipped; an extension is the controlled
way to propose new intended behaviour.

## Directory layout

```text
docs/specs/
  README.md                                      # this workflow
  spec.md                                        # authoring guide for specifications
  summary.md                                     # authoring guide for implementation summaries
  001-feature-slug-spec.md                       # reviewed contract; immutable once approved
  001-feature-slug-spec-review-YYYYMMDDThhmm.md  # optional pre-approval review record
  001-feature-slug-spec-summary.md               # created after delivery; immutable record
  001-feature-slug-spec-extension-001.md         # optional later proposal
```

Numbers identify the feature contract and make related files sort together.
Allocate the next three-digit number when a draft begins; use lower-case,
kebab-case slugs. Keep every document in Git with the code it governs.

## Lifecycle

1. **Draft.** Copy the structure in `spec.md` to a new numbered
   `NNN-feature-slug-spec.md`. State the problem, scope, non-goals,
   requirements, scenarios, data/privacy constraints, and acceptance evidence.
   A draft author may edit it freely.
2. **Review and approval.** A human reviewer explicitly accepts the draft.
   Advisory reviews use `NNN-feature-slug-spec-review-YYYYMMDDThhmm.md` and
   remain separate from both the contract and its implementation summary.
   Set its status to `Approved`, record the approver and date, and commit it.
   No feature implementation begins before this step.
3. **Implementation.** Agents implement only the approved requirements. They do
   not create a summary placeholder while work is pending.
4. **Close.** After implementation and acceptance evidence are complete, create
   `NNN-feature-slug-spec-summary.md` with commits, tests, operational
   verification, limitations, and any divergence. The original `*-spec.md`
   remains unchanged.
5. **Extend.** If desired behaviour changes later, add a numbered
   `NNN-feature-slug-spec-extension-001.md`. It must reference the parent spec,
   state whether it is compatible, and receive its own review before
   implementation.

## Rules

- An **approved `*-spec.md` is immutable**. Correcting an ambiguity after
  approval is an extension, even if the code has not started yet.
- A `*-spec-summary.md` is created only after implementation completes. It is
  append-only in normal use, records reality, and never rewrites the approved
  requirements.
- A summary may record a deviation, but a deviation does not silently change
  the product contract. Intended follow-up behaviour requires an extension.
- Write requirements with `SHALL`, `MUST`, or `MUST NOT`, and attach at least
  one testable GIVEN/WHEN/THEN scenario to each consequential requirement.
- Include data contracts, privacy/security limits, operational behaviour, and
  migration decisions where relevant.
- Small internal refactors and typo fixes that do not change behaviour may skip
  a feature spec. If there is doubt, write a small spec.

## Status values

| Status | Meaning |
|---|---|
| `Draft` | Open for authoring; implementation is not authorised. |
| `In review` | Submitted to the requester/reviewer; implementation is not authorised. |
| `Approved` | Frozen contract; implementation is authorised. |
| `Implemented` | All planned work is delivered and recorded in the summary. |
| `Superseded` | A later approved spec replaces this one; retain it for history. |

## Reference

The requirement/scenario structure is inspired by
[OpenSpec](https://openspec.dev/), a lightweight spec-driven development
workflow. We intentionally do not require its CLI: Markdown and Git history
are the durable source of truth here.
