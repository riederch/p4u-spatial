# XR Derived Candidates and Review v0.1

## Boundary

Derived candidates are reconstructable interpretations of immutable XR capture evidence.

They are **not** canonical Spatial objects.

The lifecycle is:

```text
committed raw scan
  -> derivation
  -> candidates
  -> review
  -> accepted operation draft
  -> explicit authorized Spatial Write
  -> optional RCHKB projection update
```

A derivation implementation MUST retain provenance back to the source scan and evidence item.

## Candidate kinds

Initial candidate kinds:

- `room`
- `wall`
- `door`
- `window`
- `asset`
- `landmark`

Runtime-specific labels may be preserved in `properties.runtimeLabel`.

## Identity

Candidate IDs are local derived identities and MUST NOT be reused as canonical Spatial object IDs by implication.

A deterministic implementation SHOULD derive the candidate ID from:

```text
(scanId, derivationProfile, evidenceRef, kind)
```

so rerunning the same profile over the same evidence can reconcile candidates.

If a reviewer accepts a candidate, the resulting Spatial operation uses an explicitly selected or newly allocated canonical `objectId`.

## Confidence

Each candidate has a confidence value in `[0,1]`.

Confidence is advisory only. A high confidence value does not bypass review unless an installation explicitly configures an automated promotion policy.

The reference profile requires review for all candidates.

## Evidence

Each candidate contains one or more evidence references:

```json
{
  "scanId": "...",
  "path": "scene.json",
  "evidenceId": "runtime-room-12"
}
```

Evidence references are immutable provenance.

## Review

Review decisions are:

- `pending`
- `accepted`
- `rejected`
- `edited`

`edited` means the reviewer changed the proposed semantic payload before acceptance.

A review record stores:

- candidate ID,
- reviewer principal,
- timestamp,
- decision,
- optional note,
- optional canonical target,
- final proposed payload for accepted/edited decisions.

## Promotion

Review does not itself mutate Spatial data.

An accepted review produces a normal Spatial Write operation draft:

- create for a new canonical object,
- update only when the reviewer explicitly selected an existing canonical target.

The operation remains subject to normal source permissions, scopes, revisions, conflict handling and RCHKB read-only policy.

## RCHKB

For an RCHKB-backed source, accepted candidates do not bypass the RCHKB source-of-truth workflow.

The normal flow is:

1. review capture evidence,
2. update canonical RCHKB knowledge/provenance,
3. update the local RCHKB Spatial projection,
4. verify the repository commit.

Direct projection writes remain disabled by default.

## Reference Bridge API

The reference bridge exposes the review boundary as:

```text
PUT /api/v1/scans/:scanId/candidates/:candidateId
GET /api/v1/admin/xr/candidates?state=pending
GET /api/v1/admin/xr/candidates/:candidateId
PUT /api/v1/admin/xr/candidates/:candidateId/review
GET /api/v1/admin/xr/candidates/:candidateId/operation-draft
```

Candidate submission requires the normal XR scan-write authorization and a durably committed source scan. Review and draft generation are administrator operations in v0.1. The operation-draft endpoint never executes the draft.
