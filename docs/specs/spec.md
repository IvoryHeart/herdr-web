# Specification authoring guide

Copy the structure below into the next numbered file named
`NNN-feature-slug-spec.md`. This guide is not itself a specification. A feature
specification may be edited while `Draft` or `In review`; once approved, it is
immutable.

---

# <Feature name>

- **Spec ID:** `NNN-feature-slug`
- **Status:** Draft
- **Created:** YYYY-MM-DD
- **Owner:** <person or team>
- **Reviewers:** <names>
- **Approved by:** —
- **Approved at:** —

> This document may be edited only while its status is `Draft` or `In review`.
> After approval it is immutable. After implementation completes, record
> delivery and drift in `NNN-feature-slug-spec-summary.md`; put later intended
> changes in a numbered `NNN-feature-slug-spec-extension-001.md`.

## 1. Purpose

<The user problem and the expected outcome.>

## 2. Scope

<What this feature includes.>

## 3. Non-goals

<Explicitly excluded work and why.>

## 4. Context and constraints

<Existing behaviour, compatibility, privacy, operational, or platform limits.>

## 5. Requirements

### Requirement: <short name>

The system SHALL <observable, testable behaviour>.

#### Scenario: <success or failure case>

- **GIVEN** <initial condition>
- **WHEN** <action or event>
- **THEN** <required observable result>

## 6. Data and interface contract

<Schemas, versioning, ownership, retention, error handling, and compatibility.>

## 7. Privacy and security

<Data minimisation, credentials, network exposure, permissions, and audit needs.>

## 8. Acceptance evidence

<Tests, manual checks, performance criteria, migration checks, and documentation.>

## 9. Deferred decisions

<Known choices explicitly postponed. An approved extension is required before
any deferred item changes required behaviour.>
