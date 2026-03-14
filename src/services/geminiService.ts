import { EvaluationResponse } from "../types";

const INLINE_SIZE_LIMIT = 20 * 1024 * 1024;
const MAX_PDF_SIZE      = 50 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function callProxy(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Proxy error ${res.status}`);
  }
  return res.json();
}

async function buildContextPart(
  contextInput: string,
  pdfFile: File | null
): Promise<unknown> {
  if (!pdfFile) {
    return { text: `Reference Context:\n${contextInput}` };
  }
  if (pdfFile.size > MAX_PDF_SIZE) {
    throw new Error(
      `PDF is ${(pdfFile.size / 1024 / 1024).toFixed(1)} MB — maximum is 50 MB.`
    );
  }
  if (pdfFile.size <= INLINE_SIZE_LIMIT) {
    const base64 = await fileToBase64(pdfFile);
    return { inlineData: { mimeType: "application/pdf", data: base64 } };
  } else {
    const { fileUri } = await callProxy("uploadPdf", {
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      fileBase64: await fileToBase64(pdfFile),
    });
    return { fileData: { mimeType: "application/pdf", fileUri } };
  }
}

export async function evaluateAIOutput(
  query:       string,
  context:     string,
  output:      string,
  format:      string,
  domain:      string      = "general",
  pdfFile:     File | null = null,
  onProgress?: (msg: string) => void
): Promise<EvaluationResponse> {

  if (pdfFile && onProgress) {
    onProgress(
      pdfFile.size > INLINE_SIZE_LIMIT
        ? "Uploading PDF to server..."
        : "Processing PDF..."
    );
  }

  if (onProgress) onProgress("Running evaluation pipeline...");

  const contextPart = await buildContextPart(context, pdfFile);

  const result = await callProxy("evaluate", {
    query,
    domain,
    format,
    output,
    hasPdf: !!pdfFile,
    contextPart,
  });

  return result as EvaluationResponse;
}

