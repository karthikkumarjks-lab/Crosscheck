# Product Vision

## What CrossCheck Is

CrossCheck is an AI-powered Marketing Quality, Consistency and Compliance
platform. It automatically inspects marketing assets and compares them
against authoritative source information, identifies inconsistencies,
explains the issue clearly, tracks changes over time, and notifies users.

CrossCheck is **not** a text-diff tool. It understands relationships between
entities and content, not just strings. See "Core Principle" below.

## What CrossCheck Must Eventually Understand

Relationships between:

- Main websites
- Subsites
- Landing pages
- Course/program pages
- UG/PG pages
- Combined course pages
- Brochures
- Email templates
- WhatsApp templates
- Other marketing assets

And, for any given asset, the system should understand:

- what the page/asset is about
- which program/course it represents
- which institution/brand it belongs to
- which source is authoritative for it
- what claims/details are being communicated
- whether the information is consistent with the authoritative source
- whether a difference is meaningful or harmless (avoiding false positives)
- the severity and business impact of a mismatch

## Core Principle: Source of Truth

CrossCheck distinguishes between two categories of information at all times:

- **Authoritative information** — the trusted source for a given
  institution/program (e.g. the official subsite/program page).
- **Marketing asset information** — the thing being checked (landing page,
  brochure, email, WhatsApp template, ...).

A marketing asset is evaluated against the *correct* authoritative source for
its institution/program — not against an arbitrary or default page. Example:
a landing page promoting "MUJ MBA" must be checked against the
Online Manipal → MUJ → MBA subsite/page, not blindly against a homepage.

This resolution step (asset → correct authoritative source) is itself a core
capability of the system, not an assumption the user provides.

## Not a Simple Comparison Engine

CrossCheck is explicitly **not**:

> "Text A != Text B"

It is a semantic, structured, and rule-driven comparison architecture:
content is extracted into structured claims/fields, compared using rules
that know what matters and what doesn't for that field, and only surfaced as
a finding when the difference is meaningful.

## Rule / Guidelines Library (concept)

A core, long-lived part of CrossCheck is a Rule / Guidelines Library. Rules
define, per checkable item:

- what should be checked
- what source should be trusted
- what constitutes a mismatch
- severity
- category
- explanation template
- recommended action
- whether human review is required

Rules must be able to evolve without rewriting the application. See
`docs/ARCHITECTURE.md` for the (currently undocumented-in-detail,
intentionally deferred) rule engine boundary — Sprint 0 documents its
existence and constraints only; it is not implemented yet.

## Examples of Information That May Need Checking

Program name, university/institution name, degree, specialization, duration,
eligibility, fees, application fee, admission information, course structure,
delivery mode, accreditations, rankings, approvals, claims, important dates,
benefits, scholarships, career claims, CTAs, contact information, and other
factual claims.

This list is explicitly **not final**. The architecture must allow new rule
categories to be added later without structural rework.

## Success Looks Like

- Meaningful mismatches are caught with high precision (few false positives).
- Every finding is explainable in plain language, with source and
  conflicting information shown side by side.
- Severity/business impact is classified, not just "different."
- History of comparisons and changes is retained, not just a point-in-time
  snapshot.
- Users are notified of what matters, on a cadence (daily/weekly reports),
  without being flooded by noise.
