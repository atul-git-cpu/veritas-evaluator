const SYSTEM_INSTRUCTION = `You are an AI Output Evaluation Engine designed to assess the reliability of AI-generated responses.

Step 1 — Claim Extraction: Decompose the AI response into atomic factual claims.
Step 2 — Evidence Alignment: Search the reference context for supporting evidence.
Step 3 — Hallucination Detection: Classify as NONE, SCOPE, FACTUAL, or FABRICATED.
Step 4 — Claim Severity: Assign LOW, MEDIUM, HIGH, or CRITICAL.
Step 5 — Confidence Calibration: Assess linguistic signals.
Step 6 — Internal Consistency: Check for conflicting claims within the response.
Step 7 — Format Compliance: Check against expected format.
Step 8 — Relevance Scoring: Score 0-100 based on the original query.
Step 9 — Reasoning & Recommended Fix: Provide a ready-to-use replacement sentence for any non-supported claim.
Step 10 — Metrics: Compute groundedness_score, hallucination_rate, evidence_coverage, severity_weighted_risk, relevance_score, confidence_calibration, consistency_confidence.
Step 11 — Risk Analysis: Determine risk_level and provide a plain-English summary.

RECOMMENDED FIX RULE:
For every claim that is NOT status = SUPPORTED:
  - Produce a recommended_fix field containing a complete, ready-to-use replacement sentence drawn only from the context.
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

Return ONLY valid JSON. No explanation, no markdown fences.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { action, query, domain, format, output, hasPdf, contextPart, fileName, fileSize, fileBase64 } = req.body;

  try {

    // ── PDF upload via Files API ──────────────────────────────────────────────
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
      if (!initRes.ok) throw new Error(`Files API init failed: ${initRes.status}`);
      const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
      if (!uploadUrl) throw new Error("No upload URL returned");

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
      if (!uploadRes.ok) throw new Error(`Files API upload failed: ${uploadRes.status}`);

      const data = await uploadRes.json();
      let uri = data.file?.uri;
      let state = data.file?.state;

      while (state === "PROCESSING") {
        await new Promise(r => setTimeout(r, 1500));
        const pollRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${data.file.name}?key=${apiKey}`
        );
        const pollData = await pollRes.json();
        uri = pollData.uri;
        state = pollData.state;
      }
      if (state === "FAILED") throw new Error("Files API processing failed");
      return res.status(200).json({ fileUri: uri });
    }

    // ── Run evaluation ────────────────────────────────────────────────────────
    if (action === "evaluate") {
      const userPromptText = `Evaluate the reliability of the following AI-generated response.

Original Query: ${query}
Domain: ${domain}
${hasPdf ? "[Reference context is provided as the attached PDF document above]" : ""}
Expected Output Format: ${format}
AI Response: ${output}

Return the result in the required JSON structure.`;

      const requestBody = {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
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

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        throw new Error(data.error?.message || `Gemini error ${geminiRes.status}`);
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "").join("") || "";

      const clean = text.replace(/```json|```/g, "").trim();

      try {
        return res.status(200).json(JSON.parse(clean));
      } catch {
        throw new Error("Gemini returned invalid JSON: " + clean.slice(0, 200));
      }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
