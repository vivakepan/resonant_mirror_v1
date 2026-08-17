# Journal-Noticer — Design Document

**Status:** **PARTIAL SHIPPED** · [README.md](../README.md)  
**Implements:** [`tools/journal_noticer/noticer.py`](../tools/journal_noticer/noticer.py) · session export [`src/sessions.js`](../src/sessions.js)  
**Full spec below;** holdout bucket, clip store, hiatus channel → **STAGED**

---

## Implementation status

| Component | Status |
|-----------|--------|
| Design + guardrails (this doc) | SHIPPED |
| Browser opt-in JSONL export | SHIPPED — `EXPORT SESSION` |
| Minimal weekly markdown runner | SHIPPED — `noticer.py` |
| Clip-bounded aggregate log | STAGED |
| Holdout control group | STAGED |
| Corrigibility / hiatus channel | STAGED |
| Pre-registered public schema commit | STAGED |

Pipeline: browser → `sessions.jsonl` → `noticer.py` and/or `tools/graph_engine/ingest.py`.

---

## What it is

A small system that watches **opt-in, anonymous, aggregate** session data from the Resonant Singer artifact and writes a **weekly public journal entry** describing what patterns it sees across users — *including, explicitly, when it sees nothing.*

It is deliberately **not** a recommender, not a personalizer, not an optimizer, and not a trained-on-user-behavior model. It is a reporting layer over sufficient statistics, with an epistemic stance designed in from the start: it is allowed to abstain, allowed to flag low confidence, and allowed to request its own pause.

The design is grounded in a survey of how user-co-evolved ML systems fail in production (catastrophic forgetting, feedback-loop homogenization, adversarial poisoning, performative drift, sycophancy/reward-hacking) and how citizen-science aggregation pipelines (eBird, Galaxy Zoo) successfully publish honest aggregate findings including null results.

---

## Founding principle

> The system's outputs must never become inputs to its own training set without an exogenous truth signal.

Every failure mode of user-co-evolved ML traces to a violation of this. The noticer avoids the whole class by **not training model weights on user behavior at all** — it stores append-only, clip-bounded sufficient statistics and runs a fixed analysis pipeline over them. "Deletion" and "rollback" are therefore well-defined operations (subtract a session's contribution, re-render), which a weight-trained system cannot offer.

---

## Architecture

```
  user session (opt-in)
        │
        ▼
  ┌─────────────┐   clip + (optional) DP noise, per-session contribution cap
  │  ingestion  │──────────────────────────────────────────────┐
  └─────────────┘                                               │
        │ continuous                                            │
        ▼                                                       ▼
  ┌──────────────────┐                              ┌────────────────────┐
  │ append-only      │                              │  holdout bucket     │
  │ aggregate log    │  (sufficient statistics)     │  (never sees journal│
  │ (running counters)│                             │   — control group)  │
  └──────────────────┘                              └────────────────────┘
        │ weekly                                                │
        ▼                                                       │
  ┌──────────────────┐    pre-registered claim schema           │
  │ analysis pipeline │◄─────────────────────────────────────────┘
  │ (the "noticer")   │    compares publishing vs holdout pop.
  └──────────────────┘
        │
        ▼
  ┌──────────────────┐   three output channels:
  │  publisher        │   (1) publish finding   (quality-flagged)
  │  (weekly journal) │   (2) publish "nothing this week"
  └──────────────────┘   (3) request hiatus     (corrigibility primitive)
        │
        ▼
  immutable, dated, public journal corpus
```

### Components

**1. Ingestion + contribution clipping.**
Each opt-in session emits a small feature vector (see below). Before anything is aggregated, the session's contribution to any statistic is **clipped at a fixed quantile** so no single session can dominate. This is the architectural protection against poisoning — the Tay failure (16 hours to collapse) and the documented Gmail spam-filter poisoning attacks both came from unbounded per-actor influence.

**2. Append-only aggregate log.**
Running sufficient statistics keyed by anonymous session id: histograms of dwell-frequency, counts of state transitions, sequence summaries. Append-only so any session's contribution can be replayed-minus on deletion. This is what makes "unwind my contribution" a real operation rather than a promise.

**3. Holdout bucket.**
5–10% of sessions whose data is collected but who are **never shown the journal page**. Used weekly to detect whether the journal's own published findings are changing behavior in the publishing population — the performative-prediction test. If publishing-vs-holdout behavior diverges beyond a pre-registered threshold, *that divergence is itself a finding to publish.*

**4. Analysis pipeline (the "noticer").**
A **fixed** analysis pipeline — not learned weights. Reads the aggregate log weekly, computes pattern statistics, checks them against a pre-registered null distribution, and emits a structured claim only if the statistic clears a pre-registered threshold. This is the conformal-abstention principle applied to aggregate findings: a calibration set (the first 8 weeks) fixes the thresholds, and anything below them is published as "no signal."

**5. Publisher with three channels.**
- **Publish finding** — structured, quality-flagged (low / medium / high, eBird-style).
- **Publish nothing** — first-class output, same visual weight as a finding.
- **Request hiatus** — a corrigibility primitive. The system can ask to pause, with a stated reason (probable poisoning, persistent null, performative spiral, complaint volume). The *decision* to honor the request is human; the request itself is the system's.

---

## Session feature vector (what's collected)

Deliberately minimal and non-identifying. The signature is **structural, not propositional** — it captures *how* someone explored, never *who* they are or *what they typed.*

| Feature | Type | Notes |
|---------|------|-------|
| dwell histogram | 10-bucket freq histogram | how long at each frequency band |
| state transitions | counts | off-res → tuning → coupling → lock → anti-res |
| exploration style | categorical | sweeper / dweller / preset-hopper (derived) |
| session duration | bucketed | not exact (privacy) |
| revisit flag | bool | returning anonymous token or not |
| preset usage | counts per preset | which presets clicked |

No audio is ever collected. No mic data leaves the device. No text. No IP stored beyond rate-limiting. The feature vector is clipped before aggregation.

---

## The claim schema (pre-registered, machine-checkable)

The noticer **cannot publish a claim that doesn't fit this schema.** This is the falsifiability discipline made structural.

```
{
  "week": "2026-W21",
  "claim": "<one sentence, plain language>",
  "statistic": "<the number that triggered this>",
  "threshold": "<pre-registered bar it had to clear>",
  "sample_size": <N sessions this week>,
  "quality_flag": "low" | "medium" | "high",
  "prior_expectation": "<what we expected before looking>",
  "alternative_explanations": ["<at least one>"],
  "null_conditions_met": <bool — were the publish-nothing conditions triggered?>,
  "holdout_divergence": "<none | flagged + magnitude>"
}
```

A "nothing this week" entry is the same schema with `claim: "no signal cleared threshold"` and the statistics that *failed* to clear.

---

## Operating phases

**Phase 0 — Pre-launch.**
Pre-register the claim schema, the null-result conditions, the anomaly/rate-limit rules, and the quality-flag formula in a public repo with a commit hash. Build the holdout bucket and the corrigibility channel. Write the first self-describing "Reward Report"-style doc about the noticer itself.

**Phase 1 — Calibration (weeks 1–8).**
Publish *only* "calibrating, no claims yet" entries. Use this window to fit the null distribution and tune rate limits. After 8 weeks, fix the thresholds at a pre-registered false-positive rate (1% or 5%) and publish them.

**Phase 2 — Steady state.**
Weekly publication, each entry quality-flagged and schema-conformant. Monthly: compare holdout vs publishing population. Quarterly: a self-report on the noticer's own behavior (publish rate, null rate, retractions, hiatus requests). Annually: review pre-registration; continue, amend-with-public-diff, or hiatus.

---

## Pre-registered guardrails (decision rules, not aspirations)

| Condition | Action |
|-----------|--------|
| Null rate < 30% in steady state | Thresholds too loose — tighten |
| Null rate > 80% for > 3 months | Either genuinely no signal (publishable!) or N too small — investigate, don't optimize |
| Holdout vs publishing divergence > 1 SD on any metric | Performative-drift event — publish it, hiatus, reconsider format |
| Anomalous-session fraction > 5% in a week | Auto non-publication + review |
| Corrigibility channel fires > 2× per quarter | Take offline, reconsider architecture |

---

## What it must never do (by design)

- **Never** train model weights on user behavior. (Avoids forgetting, poisoning, drift, irreversibility.)
- **Never** optimize a metric, even implicitly. (Even "diversity-aware" optimization homogenizes over time.)
- **Never** let one session move aggregate output materially. (Clip before aggregate.)
- **Never** delete a null week or a failed finding. (The corpus of "nothing this week" entries is the most honest part of the project.)
- **Never** personalize. (Re-introduces the per-user feedback loop the architecture removes.)

---

## Why this is a contribution, not just caution

No production-scale ML system has documented a corrigibility ("request to pause") architecture — the literature on it (Soares et al. 2015; Hadfield-Menell et al. 2017's Off-Switch Game) is almost entirely theoretical. A weekly-cadence art project with a literal hiatus channel, pre-registered nulls, and an immutable corpus of honest "nothing happened" entries is, paradoxically, on a *safer* release cadence than frontier labs (cf. the April 2025 GPT-4o sycophancy episode: ~3 days from deployment to rollback on a globally-distributed model).

The participatory-ML critique literature (Sloane et al., Birhane et al.) warns that "participation" is often performative legitimation. The defense here is the project's existing methodology: pre-registered falsifiability, mandatory null findings, and explicit ignorance nodes. None are common in deployed ML. That is the contribution.

---

## Vocabulary borrowed from citizen science

- "no prediction" / "insufficient data" / "modeled area" (eBird)
- "consensus / no consensus" (Galaxy Zoo vote fractions)
- "preemptive retirement" when no signal is annotated (Clump Scout)
- Red / Yellow / Green seasonal quality rating (eBird)
- "data deficient" (IUCN-style)

---

*This design intentionally trades capability for honesty. A more sophisticated noticer (a small learned model with forgetting-protection and DP-bounded updates) is possible; the cost-benefit does not favor it for a project whose failure cost is loss of integrity, not loss of scale.*
