import { GoogleGenAI } from "@google/genai";
import { EVAL_SCHEMA, EvaluationResponse } from "../types";

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
Step 10 — Metrics: Compute groundedness_score, hallucination_rate, etc.
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
  - Write 2–3 sentences maximum.
  - Use no technical terms.
  - State what is wrong, how serious it is, and what the reviewer should do.
  - Write for a product manager, not an engineer.`;

const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20 MB
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function uploadToFilesAPI(file: File, apiKey: string): Promise<string> {
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": file.size.toString(),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  );
  if (!initRes.ok) throw new Error(`Files API init failed: ${initRes.status}`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Files API");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": "application/pdf",
    },
    body: file,
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
  return uri;
}

async function buildContextPart(contextInput: string, pdfFile: File | null, apiKey: string): Promise<any> {
  if (!pdfFile) {
    return { text: `Reference Context:\n${contextInput}` };
  }

  if (pdfFile.size > MAX_PDF_SIZE) {
    throw new Error(`PDF is ${(pdfFile.size / 1024 / 1024).toFixed(1)} MB — maximum is 50 MB.`);
  }

  if (pdfFile.size <= INLINE_SIZE_LIMIT) {
    const base64 = await fileToBase64(pdfFile);
    return { inlineData: { mimeType: "application/pdf", data: base64 } };
  } else {
    const fileUri = await uploadToFilesAPI(pdfFile, apiKey);
    return { fileData: { mimeType: "application/pdf", fileUri } };
  }
}

export async function evaluateAIOutput(
  query: string,
  context: string,
  output: string,
  format: string,
  domain: string = "general",
  pdfFile: File | null = null,
  onProgress?: (msg: string) => void
): Promise<EvaluationResponse> {
  const apiKey = "AIzaSyCLMsBcdjRLTTWIyDXpnp_Kve1QDzRDbnQ";
  const ai = new GoogleGenAI({ apiKey });

  if (pdfFile && onProgress) {
    onProgress(pdfFile.size > INLINE_SIZE_LIMIT ? "Uploading PDF to Gemini Files API..." : "Processing PDF...");
  }

  const contextPart = await buildContextPart(context, pdfFile, apiKey);

  const userPromptText = `Evaluate the reliability of the following AI-generated response.

Original Query: ${query}
Domain: ${domain}
${!pdfFile ? "" : "[Reference context is provided as the attached PDF document above]"}
Expected Output Format: ${format}
AI Response: ${output}

Return the result in the required JSON structure.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        contextPart,
        { text: userPromptText }
      ]
    },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: EVAL_SCHEMA as any,
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("Empty response from Gemini");
  }

  return JSON.parse(response.text) as EvaluationResponse;
}
