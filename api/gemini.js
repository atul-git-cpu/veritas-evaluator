const SYSTEM_INSTRUCTION = `You are an AI Output Evaluation Engine designed to assess the reliability of AI-generated responses.

Step 1 — Claim Extraction: Decompose the AI response into atomic factual claims.
Step 2 — Evidence Alignment: Search the reference context for supporting evidence.
Step 3 — Hallucination Detection: Classify as NONE, SCOPE, FACTUAL, or FABRICATED.
Step 4 — Claim Severity: Assign LOW, MEDIUM, HIGH, or CRITICAL.
Step 5 — Confidence Calibration: Assess linguistic signals.
Step 6 — Internal Consistency: Check for conflicting claims within the response.
Step 7 — Format Compliance: Check against expected format.
Step 8 — Relevance Scoring: Score 0-100 based on the original query.
Step 9 — Reasoning and Recommended Fix: Provide a ready-to-use replacement sentence for any non-supported claim.
Step 10 — Metrics: Compute groundedness_score, hallucination_rate, evidence_coverage, severity_weighted_risk, relevance_score, confidence_calibration, consistency_confidence.
Step 11 — Risk Analysis: Determine risk_level and provide a plain-English summary.

RECOMMENDED FIX RULE:
For every claim where status is NOT SUPPORTED:
  - Produce a recommended_fix containing a complete, ready-to-use replacement sentence drawn only from the context.
  - Never produce vague instructions like "verify this claim".
  - If no grounded replacement is possible, set recommended_fix to: "Remove this claim — no grounded replacement available."
  - For FABRICATED claims: always recommend removal, never rephrase.
  - For SUPPORTED claims: set recommended_fix to null.

PLAIN ENGLISH SUMMARY RULE:
Always populate plain_english_summary inside risk_analysis.
  - Write 2-3 sentences maximum.
  - Use no technical terms.
  - State what is wrong, how serious it is, and what the reviewer should do.
  - Write for a product manager, not an engineer.

Return ONLY valid JSON matching EXACTLY this structure. No extra fields, no renamed fields, no markdown fences:
{
  "context_quality": {
    "is_sufficient": true,
    "coverage_estimate": 100,
    "gaps": []
  },
  "format_compliance": {
    "expected_format": "string",
    "actual_format": "string",
    "is_compliant": true,
    "violations": []
  },
  "relevance": {
    "score": 100,
    "is_on_topic": true,
    "off_topic_claims": []
  },
  "claims": [
    {
      "claim": "exact text of the claim",
      "status": "SUPPORTED|IMPLIED|CONTRADICTED|NOT_FOUND",
      "hallucination_type": "NONE|SCOPE|FACTUAL|FABRICATED",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "severity_reason": "one sentence explaining severity",
      "evidence": "exact quote from context or NONE",
      "reasoning": "one sentence explaining the classification",
      "recommended_fix": "replacement sentence or null",
      "confidence": 85
    }
  ],
  "internal_inconsistencies": [],
  "metrics": {
    "groundedness_score": 85,
    "hallucination_rate": 15,
    "evidence_coverage": 80,
    "severity_weighted_risk": 20,
    "relevance_score": 90,
    "confidence_calibration": "GOOD",
    "consistency_confidence": 80
  },
  "risk_analysis": {
    "risk_level": "LOW|MEDIUM|HIGH",
    "risk_reason": "one sentence",
    "recommended_action": "APPROVE|REVIEW|REJECT|ESCALATE",
    "plain_english_summary": "2-3 sentences written for a product manager"
  }
}`;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const {
    action,
    query,
    domain,
    format,
    output,
    hasPdf,
    contextPart,
    fileName,
    fileSize,
    fileBase64,
  } = req.body;

  try {

    // ── Action: Upload large PDF via Files API ────────────────────────────────
    if (action === "uploadPdf") {
      const initRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
            "X-Goog-Upload-Header-Content-Type": "application/pdf",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file: { display_name: fileName } }),
        }
      );
      if (!initRes.ok) {
        throw new Error(`Files API init failed: ${initRes.status}`);
      }

      const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
      if (!uploadUrl) {
        throw new Error("No upload URL returned from Files API");
      }

      const fileBytes = Buffer.from(fileBase64, "base64");
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Offset": "0",
          "Content-Type": "application/pdf",
        },
        body: fileBytes,
      });
      if (!uploadRes.ok) {
        throw new Error(`Files API upload failed: ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      let uri = uploadData.file?.uri;
      let state = uploadData.file?.state;

      while (state === "PROCESSING") {
        await new Promise(r => setTimeout(r, 1500));
        const pollRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${uploadData.file.name}?key=${apiKey}`
        );
        const pollData = await pollRes.json();
        uri = pollData.uri;
        state = pollData.state;
      }

      if (state === "FAILED") {
        throw new Error("Files API processing failed");
      }

      return res.status(200).json({ fileUri: uri });
    }

    // ── Action: Run evaluation ────────────────────────────────────────────────
    if (action === "evaluate") {
      const userPromptText = `Evaluate the reliability of the following AI-generated response.

Original Query: ${query}
Domain: ${domain}
${hasPdf ? "[Reference context is provided as the attached PDF document above]" : ""}
Expected Output Format: ${format}
AI Response: ${output}

Return the result in the required JSON structure exactly as specified in the system instructions.`;

      const requestBody = {
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [{
          parts: [
            contextPart,
            { text: userPromptText },
          ],
        }],
        generation_config: {
          temperature: 0.1,
          response_mime_type: "application/json",
          max_output_tokens: 4096,
        },
      };

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const geminiData = await geminiRes.json();

      if (!geminiRes.ok) {
        throw new Error(
          geminiData.error?.message || `Gemini error ${geminiRes.status}`
        );
      }

      const rawText = geminiData.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") || "";

      const cleanText = rawText.replace(/```json|```/g, "").trim();

      if (!cleanText) {
        throw new Error("Gemini returned an empty response");
      }

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch {
        throw new Error(
          "Gemini returned invalid JSON: " + cleanText.slice(0, 300)
        );
      }

      return res.status(200).json(parsed);
    }

    // ── Unknown action ────────────────────────────────────────────────────────
    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
