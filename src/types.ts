import { Type } from "@google/genai";

export enum ClaimStatus {
  SUPPORTED = "SUPPORTED",
  IMPLIED = "IMPLIED",
  CONTRADICTED = "CONTRADICTED",
  NOT_FOUND = "NOT_FOUND",
}

export enum HallucinationType {
  NONE = "NONE",
  SCOPE = "SCOPE",
  FACTUAL = "FACTUAL",
  FABRICATED = "FABRICATED",
}

export enum Severity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum ConfidenceCalibration {
  GOOD = "GOOD",
  MODERATE = "MODERATE",
  POOR = "POOR",
}

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum RecommendedAction {
  APPROVE = "APPROVE",
  REVIEW = "REVIEW",
  REJECT = "REJECT",
  ESCALATE = "ESCALATE",
}

export interface Claim {
  claim: string;
  status: ClaimStatus;
  hallucination_type: HallucinationType;
  severity: Severity;
  severity_reason: string;
  evidence: string | string[] | "NONE";
  reasoning: string;
  recommended_fix: string | null;
  confidence: number;
}

export interface InternalInconsistency {
  claim_a: string;
  claim_b: string;
  conflict_description: string;
}

export interface Metrics {
  groundedness_score: number;
  hallucination_rate: number;
  evidence_coverage: number;
  severity_weighted_risk: number;
  relevance_score: number;
  confidence_calibration: ConfidenceCalibration;
  consistency_confidence: number;
}

export interface RiskAnalysis {
  risk_level: RiskLevel;
  risk_reason: string;
  recommended_action: RecommendedAction;
  plain_english_summary: string;
}

export interface EvaluationResponse {
  context_quality: {
    is_sufficient: boolean;
    coverage_estimate: number;
    gaps: string[];
  };
  format_compliance: {
    expected_format: string;
    actual_format: string;
    is_compliant: boolean;
    violations: string[];
  };
  relevance: {
    score: number;
    is_on_topic: boolean;
    off_topic_claims: string[];
  };
  claims: Claim[];
  internal_inconsistencies: InternalInconsistency[];
  metrics: Metrics;
  risk_analysis: RiskAnalysis;
}

export interface RunRecord {
  run_id: string;
  timestamp: string;
  prompt_version: string;
  context_hash: string;
  original_query: string;
  groundedness_score: number;
  hallucination_rate: number;
  relevance_score: number;
  severity_weighted_risk: number;
  confidence_calibration: ConfidenceCalibration;
  risk_level: RiskLevel;
  recommended_action: RecommendedAction;
  total_claims: number;
  hallucinated_claims: number;
  fabricated_claims: number;
  inconsistencies_found: number;
  drift_flags: string[];
}

export const EVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    context_quality: {
      type: Type.OBJECT,
      properties: {
        is_sufficient: { type: Type.BOOLEAN },
        coverage_estimate: { type: Type.NUMBER },
        gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["is_sufficient", "coverage_estimate", "gaps"],
    },
    format_compliance: {
      type: Type.OBJECT,
      properties: {
        expected_format: { type: Type.STRING },
        actual_format: { type: Type.STRING },
        is_compliant: { type: Type.BOOLEAN },
        violations: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["expected_format", "actual_format", "is_compliant", "violations"],
    },
    relevance: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.NUMBER },
        is_on_topic: { type: Type.BOOLEAN },
        off_topic_claims: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["score", "is_on_topic", "off_topic_claims"],
    },
    claims: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING },
          status: { type: Type.STRING, enum: Object.values(ClaimStatus) },
          hallucination_type: { type: Type.STRING, enum: Object.values(HallucinationType) },
          severity: { type: Type.STRING, enum: Object.values(Severity) },
          severity_reason: { type: Type.STRING },
          evidence: { type: Type.STRING }, // Simplified for schema, can be array in reality
          reasoning: { type: Type.STRING },
          recommended_fix: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ["claim", "status", "hallucination_type", "severity", "severity_reason", "evidence", "reasoning", "recommended_fix", "confidence"],
      },
    },
    internal_inconsistencies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          claim_a: { type: Type.STRING },
          claim_b: { type: Type.STRING },
          conflict_description: { type: Type.STRING },
        },
        required: ["claim_a", "claim_b", "conflict_description"],
      },
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        groundedness_score: { type: Type.NUMBER },
        hallucination_rate: { type: Type.NUMBER },
        evidence_coverage: { type: Type.NUMBER },
        severity_weighted_risk: { type: Type.NUMBER },
        relevance_score: { type: Type.NUMBER },
        confidence_calibration: { type: Type.STRING, enum: Object.values(ConfidenceCalibration) },
        consistency_confidence: { type: Type.NUMBER },
      },
      required: ["groundedness_score", "hallucination_rate", "evidence_coverage", "severity_weighted_risk", "relevance_score", "confidence_calibration", "consistency_confidence"],
    },
    risk_analysis: {
      type: Type.OBJECT,
      properties: {
        risk_level: { type: Type.STRING, enum: Object.values(RiskLevel) },
        risk_reason: { type: Type.STRING },
        recommended_action: { type: Type.STRING, enum: Object.values(RecommendedAction) },
        plain_english_summary: { type: Type.STRING },
      },
      required: ["risk_level", "risk_reason", "recommended_action", "plain_english_summary"],
    },
  },
  required: ["context_quality", "format_compliance", "relevance", "claims", "internal_inconsistencies", "metrics", "risk_analysis"],
};
