import { join } from "node:path";
import { BridgeError, assertOrThrow } from "../errors.js";
import { AtomicJsonStore } from "../storage/atomic-json-store.js";
import { nowIso, sha256, stableStringify } from "../util.js";

type CandidateKind = "room" | "wall" | "door" | "window" | "asset" | "landmark";
type ReviewDecision = "accepted" | "rejected" | "edited";
type JsonObject = Record<string, unknown>;

interface EvidenceRef {
  scanId: string;
  path: string;
  evidenceId?: string;
}

interface CandidateRecord {
  candidateId: string;
  scanId: string;
  profile: string;
  kind: CandidateKind;
  confidence: number;
  evidence: EvidenceRef[];
  proposal: JsonObject;
  submittedBy: string;
  submittedAt: string;
  requestHash: string;
  review: {
    state: "pending" | ReviewDecision;
    reviewer?: string;
    reviewedAt?: string;
    note?: string;
    sourceId?: string;
    collectionId?: string;
    objectId?: string;
    baseRevision?: string | null;
    payload?: JsonObject;
  };
  promotion?: {
    operationId: string;
    confirmationToken: string;
    promotedAt?: string;
    result?: JsonObject;
  };
}

interface CandidateState {
  candidates: Record<string, CandidateRecord>;
}

export interface ReviewInput {
  decision: ReviewDecision;
  reviewer: string;
  note?: string;
  sourceId?: string;
  collectionId?: string;
  objectId?: string;
  baseRevision?: string | null;
  payload?: JsonObject;
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  assertOrThrow(typeof value === "string" && value.length > 0, 400, "CANDIDATE_INVALID", `${name} is required.`);
  return value;
}

function parseKind(value: unknown): CandidateKind {
  assertOrThrow(
    value === "room" || value === "wall" || value === "door" || value === "window" || value === "asset" || value === "landmark",
    400,
    "CANDIDATE_INVALID",
    "Unsupported candidate kind.",
  );
  return value;
}

function candidateHash(input: unknown): string {
  return sha256(Buffer.from(stableStringify(input)));
}

// ADR: docs/adr/bridge/0004-ai-optional-deterministic-core.md — derived interpretations remain provenance-bearing candidates until explicit review/promotion.
export class CandidateReviewService {
  private readonly store: AtomicJsonStore<CandidateState>;

  constructor(
    stateDir: string,
    private readonly scanCommitted: (scanId: string) => Promise<boolean>,
  ) {
    this.store = new AtomicJsonStore(join(stateDir, "xr-candidates.json"), () => ({ candidates: {} }));
  }

  async submit(scanId: string, principalId: string, raw: unknown): Promise<CandidateRecord> {
    assertOrThrow(isRecord(raw), 400, "CANDIDATE_INVALID", "Candidate JSON object required.");
    assertOrThrow(requiredString(raw.scanId, "scanId") === scanId, 400, "CANDIDATE_SCAN_MISMATCH", "Candidate scanId must match URL scanId.");
    assertOrThrow(await this.scanCommitted(scanId), 409, "SCAN_NOT_COMMITTED", "Candidate derivation requires a durably committed scan.");
    assertOrThrow(Array.isArray(raw.evidence) && raw.evidence.length > 0, 400, "CANDIDATE_INVALID", "Candidate evidence is required.");
    assertOrThrow(isRecord(raw.proposal), 400, "CANDIDATE_INVALID", "Candidate proposal must be a JSON object.");

    const candidateId = requiredString(raw.candidateId, "candidateId");
    const evidence = raw.evidence.map((entry, index) => {
      assertOrThrow(isRecord(entry), 400, "CANDIDATE_INVALID", `evidence[${index}] must be an object.`);
      const evidenceScanId = requiredString(entry.scanId, `evidence[${index}].scanId`);
      assertOrThrow(evidenceScanId === scanId, 400, "CANDIDATE_SCAN_MISMATCH", "All evidence must reference the candidate scan.");
      const result: EvidenceRef = {
        scanId: evidenceScanId,
        path: requiredString(entry.path, `evidence[${index}].path`),
      };
      if (typeof entry.evidenceId === "string" && entry.evidenceId.length > 0) result.evidenceId = entry.evidenceId;
      return result;
    });

    const confidence = raw.confidence;
    assertOrThrow(typeof confidence === "number" && confidence >= 0 && confidence <= 1, 400, "CANDIDATE_INVALID", "confidence must be between 0 and 1.");

    const normalized = {
      candidateId,
      scanId,
      profile: requiredString(raw.profile, "profile"),
      kind: parseKind(raw.kind),
      confidence,
      evidence,
      proposal: raw.proposal,
    };
    const requestHash = candidateHash(normalized);

    return this.store.mutate((state) => {
      const existing = state.candidates[candidateId];
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new BridgeError(409, "CANDIDATE_ID_CONFLICT", "candidateId already exists with different logical content.");
        }
        return existing;
      }

      const record: CandidateRecord = {
        ...normalized,
        submittedBy: principalId,
        submittedAt: nowIso(),
        requestHash,
        review: { state: "pending" },
      };
      state.candidates[candidateId] = record;
      return record;
    });
  }

  async list(stateFilter?: string): Promise<CandidateRecord[]> {
    const candidates = Object.values((await this.store.read()).candidates);
    if (!stateFilter) return candidates;
    assertOrThrow(
      stateFilter === "pending" || stateFilter === "accepted" || stateFilter === "rejected" || stateFilter === "edited",
      400,
      "CANDIDATE_FILTER_INVALID",
      "Unsupported candidate state filter.",
    );
    return candidates.filter((candidate) => candidate.review.state === stateFilter);
  }

  async get(candidateId: string): Promise<CandidateRecord> {
    const candidate = (await this.store.read()).candidates[candidateId];
    if (!candidate) throw new BridgeError(404, "CANDIDATE_NOT_FOUND", "Derived candidate not found.");
    return candidate;
  }

  async review(candidateId: string, raw: unknown): Promise<CandidateRecord> {
    assertOrThrow(isRecord(raw), 400, "CANDIDATE_REVIEW_INVALID", "Review JSON object required.");
    const decision = raw.decision;
    assertOrThrow(decision === "accepted" || decision === "rejected" || decision === "edited", 400, "CANDIDATE_REVIEW_INVALID", "decision must be accepted, rejected or edited.");
    const reviewer = requiredString(raw.reviewer, "reviewer");
    if (decision === "edited") assertOrThrow(isRecord(raw.payload), 400, "CANDIDATE_REVIEW_INVALID", "edited review requires payload.");

    const nextReview = {
      state: decision,
      reviewer,
      reviewedAt: nowIso(),
      ...(typeof raw.note === "string" ? { note: raw.note } : {}),
      ...(typeof raw.sourceId === "string" ? { sourceId: raw.sourceId } : {}),
      ...(typeof raw.collectionId === "string" ? { collectionId: raw.collectionId } : {}),
      ...(typeof raw.objectId === "string" ? { objectId: raw.objectId } : {}),
      ...(raw.baseRevision === null || typeof raw.baseRevision === "string" ? { baseRevision: raw.baseRevision } : {}),
      ...(isRecord(raw.payload) ? { payload: raw.payload } : {}),
    } as CandidateRecord["review"];

    if (decision !== "rejected") {
      assertOrThrow(nextReview.sourceId && nextReview.collectionId, 400, "CANDIDATE_REVIEW_INVALID", "accepted/edited review requires sourceId and collectionId.");
      if (nextReview.objectId) {
        assertOrThrow(typeof nextReview.baseRevision === "string", 400, "CANDIDATE_REVIEW_INVALID", "Updating an existing object requires baseRevision.");
      } else {
        assertOrThrow(nextReview.baseRevision === null || nextReview.baseRevision === undefined, 400, "CANDIDATE_REVIEW_INVALID", "New object review must not carry a non-null baseRevision.");
      }
    }

    return this.store.mutate((state) => {
      const candidate = state.candidates[candidateId];
      if (!candidate) throw new BridgeError(404, "CANDIDATE_NOT_FOUND", "Derived candidate not found.");
      if (candidate.review.state !== "pending") {
        const comparableCurrent = { ...candidate.review, reviewedAt: undefined };
        const comparableNext = { ...nextReview, reviewedAt: undefined };
        if (stableStringify(comparableCurrent) !== stableStringify(comparableNext)) {
          throw new BridgeError(409, "CANDIDATE_ALREADY_REVIEWED", "Candidate already has a different terminal review.");
        }
        return candidate;
      }
      candidate.review = nextReview;
      return candidate;
    });
  }

  private canonicalPayload(candidate: CandidateRecord): JsonObject {
    const review = candidate.review;
    const base = { ...(review.payload ?? candidate.proposal) };
    const existingProvenance = isRecord(base.provenance) ? base.provenance : {};
    return {
      ...base,
      provenance: {
        ...existingProvenance,
        xrCapture: {
          scanId: candidate.scanId,
          candidateId: candidate.candidateId,
          derivationProfile: candidate.profile,
          evidence: candidate.evidence,
          reviewer: review.reviewer,
          reviewedAt: review.reviewedAt,
        },
      },
    };
  }

  async promotionPreview(candidateId: string): Promise<JsonObject> {
    const candidate = await this.get(candidateId);
    const review = candidate.review;
    if (review.state !== "accepted" && review.state !== "edited") {
      throw new BridgeError(409, "CANDIDATE_NOT_ACCEPTED", "Only accepted or edited candidates can be promoted.");
    }
    assertOrThrow(review.sourceId && review.collectionId, 500, "CANDIDATE_REVIEW_INVALID", "Accepted candidate is missing target metadata.");

    const operationId = `candidate-promotion:${sha256(Buffer.from(candidate.candidateId)).slice(0, 32)}`;
    const target: JsonObject = {
      sourceId: review.sourceId,
      collectionId: review.collectionId,
    };
    if (review.objectId) target.objectId = review.objectId;

    const operation: JsonObject = {
      operationId,
      target,
      action: review.objectId ? "update" : "create",
      baseRevision: review.objectId ? review.baseRevision : null,
      payload: this.canonicalPayload(candidate),
    };
    const confirmationToken = sha256(Buffer.from(stableStringify(operation)));

    return {
      candidateId: candidate.candidateId,
      scanId: candidate.scanId,
      confirmationToken,
      operation,
      alreadyPromoted: !!candidate.promotion?.result,
      ...(candidate.promotion?.result ? { previousResult: candidate.promotion.result } : {}),
    };
  }

  async assertPromotionConfirmation(candidateId: string, confirmationToken: string): Promise<JsonObject> {
    const preview = await this.promotionPreview(candidateId);
    assertOrThrow(
      typeof confirmationToken === "string" && confirmationToken === preview.confirmationToken,
      409,
      "PROMOTION_CONFIRMATION_MISMATCH",
      "Promotion confirmation token does not match the current reviewed operation.",
    );
    return preview;
  }

  async markPromoted(candidateId: string, confirmationToken: string, result: JsonObject): Promise<CandidateRecord> {
    return this.store.mutate((state) => {
      const candidate = state.candidates[candidateId];
      if (!candidate) throw new BridgeError(404, "CANDIDATE_NOT_FOUND", "Derived candidate not found.");
      const operationId = typeof result.operationId === "string"
        ? result.operationId
        : `candidate-promotion:${sha256(Buffer.from(candidateId)).slice(0, 32)}`;
      candidate.promotion = {
        operationId,
        confirmationToken,
        promotedAt: nowIso(),
        result,
      };
      return candidate;
    });
  }

  async operationDraft(candidateId: string): Promise<JsonObject> {
    const candidate = await this.get(candidateId);
    const review = candidate.review;
    if (review.state !== "accepted" && review.state !== "edited") {
      throw new BridgeError(409, "CANDIDATE_NOT_ACCEPTED", "Only accepted or edited candidates can produce a Spatial operation draft.");
    }
    assertOrThrow(review.sourceId && review.collectionId, 500, "CANDIDATE_REVIEW_INVALID", "Accepted candidate is missing target metadata.");

    const payload = review.payload ?? candidate.proposal;
    const isUpdate = typeof review.objectId === "string";
    const draftTarget: JsonObject = {
      sourceId: review.sourceId,
      collectionId: review.collectionId,
    };
    if (review.objectId) draftTarget.objectId = review.objectId;

    return {
      draft: true,
      candidateId: candidate.candidateId,
      scanId: candidate.scanId,
      target: draftTarget,
      action: isUpdate ? "update" : "create",
      baseRevision: isUpdate ? review.baseRevision : null,
      payload,
      provenance: {
        scanId: candidate.scanId,
        candidateId: candidate.candidateId,
        derivationProfile: candidate.profile,
        evidence: candidate.evidence,
        reviewer: review.reviewer,
        reviewedAt: review.reviewedAt,
      },
    };
  }
}
