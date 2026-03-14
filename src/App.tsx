import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  History, 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Search,
  Zap,
  Layers,
  BarChart3,
  ArrowRight,
  Info,
  Copy,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  FileText,
  Layout,
  Upload,
  File
} from 'lucide-react';
import { evaluateAIOutput } from './services/geminiService';
import { 
  ClaimStatus, 
  EvaluationResponse, 
  RiskLevel, 
  RecommendedAction, 
  HallucinationType,
  RunRecord,
  Severity
} from './types';
import { hashContext, saveRun, loadHistory, getRunsForContext, computeDriftFlags } from './utils';

// --- Components ---

function PdfDropZone({ file, onFile, onClear }: { file: File | null, onFile: (f: File) => void, onClear: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") onFile(dropped);
  }, [onFile]);

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
        <div className="p-2 bg-emerald-500/10 rounded-lg">
          <File className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-[10px] text-white/40">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        </div>
        <button
          onClick={onClear}
          className="p-1 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragging ? "border-emerald-500 bg-emerald-500/5" : "border-white/10 hover:border-white/20 bg-white/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <Upload className="w-8 h-8 text-white/20 mx-auto mb-3" />
      <p className="text-sm text-white/60">
        Drop PDF here or <span className="text-emerald-500">click to browse</span>
      </p>
      <p className="text-[10px] text-white/40 mt-2">
        PDF only · max 50 MB · up to 1000 pages
      </p>
    </div>
  );
}

function ContextInput({ textValue, onTextChange, pdfFile, onPdfFile }: { textValue: string, onTextChange: (v: string) => void, pdfFile: File | null, onPdfFile: (f: File | null) => void }) {
  const [tab, setTab] = useState<"text" | "pdf">(pdfFile ? "pdf" : "text");

  return (
    <div className="space-y-4">
      <div className="flex border-b border-white/10">
        <button 
          onClick={() => setTab("text")}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${
            tab === "text" ? "border-emerald-500 text-emerald-500" : "border-transparent text-white/40 hover:text-white/60"
          }`}
        >
          PASTE TEXT
        </button>
        <button 
          onClick={() => setTab("pdf")}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            tab === "pdf" ? "border-emerald-500 text-emerald-500" : "border-transparent text-white/40 hover:text-white/60"
          }`}
        >
          UPLOAD PDF
          {pdfFile && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {tab === "text" ? (
        <textarea
          value={textValue}
          onChange={e => onTextChange(e.target.value)}
          placeholder="Paste your reference document, knowledge base excerpt, or source content here..."
          className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all resize-none"
        />
      ) : (
        <PdfDropZone
          file={pdfFile}
          onFile={onPdfFile}
          onClear={() => onPdfFile(null)}
        />
      )}

      {pdfFile && tab === "text" && (
        <p className="text-[10px] text-amber-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          A PDF is loaded — it will be used as context instead of this text.
          <button onClick={() => onPdfFile(null)} className="text-red-500 hover:underline ml-1">Clear PDF</button>
        </p>
      )}
    </div>
  );
}

const LandingPage = ({ onStart }: { onStart: () => void }) => {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Hero Section */}
      <section className="relative h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#10b98115_0%,transparent_60%)]" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center max-w-4xl"
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
            Veritas AI Evaluator
          </h1>
          <p className="text-xl md:text-2xl text-white/60 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
            Production-grade hallucination detection. Verify AI claims, detect drift, and ship with absolute confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={onStart}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-full transition-all flex items-center justify-center gap-2 group"
            >
              Start Evaluating <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all">
              Watch Demo
            </button>
          </div>
        </motion.div>
        
        {/* Visual Preview */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 50 }}
          transition={{ delay: 0.4, duration: 1 }}
          className="relative w-full max-w-5xl aspect-video bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent z-10" />
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-amber-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/50" />
          </div>
          <div className="grid grid-cols-3 h-full opacity-50">
            <div className="border-r border-white/5 p-4 space-y-4">
              <div className="h-4 w-3/4 bg-white/10 rounded" />
              <div className="h-32 w-full bg-white/5 rounded" />
            </div>
            <div className="border-r border-white/5 p-4 space-y-4">
              <div className="h-4 w-1/2 bg-white/10 rounded" />
              <div className="h-64 w-full bg-white/5 rounded" />
            </div>
            <div className="p-4 space-y-4">
              <div className="h-4 w-2/3 bg-white/10 rounded" />
              <div className="h-20 w-full bg-emerald-500/10 rounded border border-emerald-500/20" />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Problem Section */}
      <section className="py-32 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div>
            <h2 className="text-4xl font-bold mb-6">AI responses look right.<br /><span className="text-emerald-500">Until they aren't.</span></h2>
            <p className="text-lg text-white/60 mb-8">Manual review doesn't scale. And the cost of a wrong answer keeps growing as you move to production.</p>
            <div className="space-y-6">
              {[
                { title: "Hidden Hallucinations", desc: "Claims that sound plausible but have zero grounding in your data." },
                { title: "Policy Contradictions", desc: "AI directly misstating fees, timelines, or legal requirements." },
                { title: "Fabricated Evidence", desc: "Invented citations and sources that pass casual human review." }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-1 text-emerald-500"><AlertTriangle className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="text-white/40 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 aspect-square flex flex-col justify-end">
              <BarChart3 className="w-8 h-8 text-emerald-500 mb-4" />
              <h3 className="font-bold">Drift Detection</h3>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 aspect-square flex flex-col justify-end translate-y-8">
              <Shield className="w-8 h-8 text-emerald-500 mb-4" />
              <h3 className="font-bold">Risk Scoring</h3>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 aspect-square flex flex-col justify-end">
              <RefreshCw className="w-8 h-8 text-emerald-500 mb-4" />
              <h3 className="font-bold">Auto-Fixes</h3>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 aspect-square flex flex-col justify-end translate-y-8">
              <Layers className="w-8 h-8 text-emerald-500 mb-4" />
              <h3 className="font-bold">Multi-Step Eval</h3>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-20">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "01", title: "Paste Inputs", desc: "Add your reference context, query, and the AI response." },
              { step: "02", title: "Run Pipeline", desc: "Veritas extracts every claim and verifies it against your source." },
              { step: "03", title: "Get Verdict", desc: "Receive a color-coded breakdown with risk scores and fixes." }
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-8xl font-bold text-white/5 absolute -top-10 -left-4 select-none">{item.step}</div>
                <h3 className="text-xl font-bold mb-4 relative z-10">{item.title}</h3>
                <p className="text-white/50 relative z-10">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 text-center px-6">
        <div className="max-w-2xl mx-auto p-12 bg-emerald-500 rounded-[32px] text-black">
          <h2 className="text-4xl font-bold mb-6">Ready to verify?</h2>
          <p className="text-lg mb-10 opacity-80">Run your first evaluation in 30 seconds. No account required.</p>
          <button 
            onClick={onStart}
            className="px-10 py-5 bg-black text-white font-bold rounded-full hover:scale-105 transition-transform"
          >
            Start Evaluating Now
          </button>
        </div>
      </section>
    </div>
  );
};

const EvaluationApp = () => {
  const [query, setQuery] = useState('');
  const [context, setContext] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState('Plain text');
  const [domain, setDomain] = useState('general');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleEvaluate = async () => {
    if (!query || (!context && !pdfFile) || !output) {
      setError("Please fill in all required fields (Query, Context/PDF, and AI Response).");
      return;
    }
    setError(null);
    setIsEvaluating(true);
    setLoadingMsg('Initializing evaluation...');
    try {
      const evalResult = await evaluateAIOutput(
        query, 
        context, 
        output, 
        format, 
        domain, 
        pdfFile, 
        (msg) => setLoadingMsg(msg)
      );
      setResult(evalResult);
      
      const contextHash = await hashContext(pdfFile ? pdfFile.name + pdfFile.size : context);
      const contextHistory = getRunsForContext(contextHash);
      
      const runRecord: RunRecord = {
        run_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        prompt_version: "v1.0",
        context_hash: contextHash,
        original_query: query,
        groundedness_score: evalResult.metrics.groundedness_score,
        hallucination_rate: evalResult.metrics.hallucination_rate,
        relevance_score: evalResult.metrics.relevance_score,
        severity_weighted_risk: evalResult.metrics.severity_weighted_risk,
        confidence_calibration: evalResult.metrics.confidence_calibration,
        risk_level: evalResult.risk_analysis.risk_level,
        recommended_action: evalResult.risk_analysis.recommended_action,
        total_claims: evalResult.claims.length,
        hallucinated_claims: evalResult.claims.filter(c => c.status === ClaimStatus.NOT_FOUND || c.status === ClaimStatus.CONTRADICTED).length,
        fabricated_claims: evalResult.claims.filter(c => c.hallucination_type === HallucinationType.FABRICATED).length,
        inconsistencies_found: evalResult.internal_inconsistencies.length,
        drift_flags: computeDriftFlags(evalResult.metrics as any, contextHistory)
      };
      
      saveRun(runRecord);
      setHistory(loadHistory());
    } catch (err: any) {
      setError(err.message || "Evaluation failed.");
    } finally {
      setIsEvaluating(false);
      setLoadingMsg('');
    }
  };

  const loadFromHistory = (run: RunRecord) => {
    // In a real app, we'd store the full inputs in the run record or a separate store
    // For this demo, we'll just show the scores
    setQuery(run.original_query);
    // Note: context and output aren't stored in the lightweight run record to save space
    // but in a production app they would be.
    setIsHistoryOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans">
      {/* Sidebar - History */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.aside 
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            className="w-80 border-r border-white/10 bg-[#050505] flex flex-col z-50"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2"><History className="w-4 h-4" /> History</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1 hover:bg-white/5 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {history.length === 0 ? (
                <div className="p-8 text-center text-white/20 text-sm">No history yet</div>
              ) : (
                history.map((run) => (
                  <button 
                    key={run.run_id}
                    onClick={() => loadFromHistory(run)}
                    className="w-full text-left p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] text-white/40 uppercase tracking-widest">{new Date(run.timestamp).toLocaleDateString()}</span>
                      <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        run.risk_level === RiskLevel.LOW ? 'bg-emerald-500/20 text-emerald-500' :
                        run.risk_level === RiskLevel.MEDIUM ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {run.risk_level}
                      </div>
                    </div>
                    <p className="text-sm font-medium line-clamp-1 mb-2">{run.original_query}</p>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/40">Groundedness: <span className="text-white">{run.groundedness_score}%</span></span>
                      {run.drift_flags.length > 0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Nav */}
        <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-[#050505]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors relative"
            >
              <History className="w-5 h-5" />
              {history.some(r => r.drift_flags.length > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-[#050505]" />
              )}
            </button>
            <div className="h-4 w-px bg-white/10" />
            <h1 className="font-bold tracking-tight">Veritas <span className="text-emerald-500">Evaluator</span></h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all flex items-center gap-2"
            >
              {isEvaluating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isEvaluating ? (loadingMsg || 'Evaluating...') : 'Run Evaluation'}
            </button>
          </div>
        </header>

        {/* Three Panel Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Panel 1: Inputs */}
          <div className="w-1/4 border-r border-white/10 flex flex-col bg-[#050505]">
            <div className="p-4 border-b border-white/10 flex items-center gap-2 text-white/40 uppercase text-[10px] font-bold tracking-widest">
              <FileText className="w-3 h-3" /> Configuration
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Original Query</label>
                <textarea 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What was the user's original question?"
                  className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Reference Context</label>
                <ContextInput
                  textValue={context}
                  onTextChange={setContext}
                  pdfFile={pdfFile}
                  onPdfFile={setPdfFile}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/60">Format</label>
                  <select 
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs outline-none"
                  >
                    <option>Plain text</option>
                    <option>JSON</option>
                    <option>Markdown</option>
                    <option>List</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/60">Domain</label>
                  <select 
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs outline-none"
                  >
                    <option value="general">General</option>
                    <option value="medical">Medical</option>
                    <option value="financial">Financial</option>
                    <option value="legal">Legal</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: AI Output */}
          <div className="flex-1 flex flex-col bg-[#0a0a0a]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between text-white/40 uppercase text-[10px] font-bold tracking-widest">
              <div className="flex items-center gap-2"><MessageSquare className="w-3 h-3" /> AI Response</div>
              {result && <span className="text-emerald-500/60">{result.claims.length} Claims Detected</span>}
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              {!result ? (
                <textarea 
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder="Paste the AI-generated response you want to evaluate..."
                  className="w-full h-full bg-transparent border-none outline-none text-lg leading-relaxed resize-none font-light"
                />
              ) : (
                <div className="prose prose-invert max-w-none">
                  {/* In a real app, we'd highlight specific spans. For now, we'll list them below or show the text */}
                  <div className="text-lg leading-relaxed font-light whitespace-pre-wrap">
                    {output.split('.').map((sentence, i) => {
                      if (!sentence.trim()) return null;
                      const claim = result.claims.find(c => sentence.includes(c.claim) || c.claim.includes(sentence.trim()));
                      let bgColor = 'transparent';
                      let borderColor = 'transparent';
                      
                      if (claim) {
                        switch (claim.status) {
                          case ClaimStatus.SUPPORTED: bgColor = 'bg-emerald-500/10'; borderColor = 'border-emerald-500/30'; break;
                          case ClaimStatus.IMPLIED: bgColor = 'bg-amber-500/10'; borderColor = 'border-amber-500/30'; break;
                          case ClaimStatus.CONTRADICTED: bgColor = 'bg-red-500/10'; borderColor = 'border-red-500/30'; break;
                          case ClaimStatus.NOT_FOUND: bgColor = 'bg-white/5'; borderColor = 'border-white/10'; break;
                        }
                      }

                      return (
                        <span 
                          key={i} 
                          className={`inline-block px-1 rounded border ${bgColor} ${borderColor} transition-all cursor-help mb-1 mr-1`}
                          title={claim?.reasoning}
                        >
                          {sentence}.
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Panel 3: Results */}
          <div className="w-1/3 border-l border-white/10 flex flex-col bg-[#050505]">
            <div className="p-4 border-b border-white/10 flex items-center gap-2 text-white/40 uppercase text-[10px] font-bold tracking-widest">
              <BarChart3 className="w-3 h-3" /> Evaluation Results
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {isEvaluating ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                  <RefreshCw className="w-12 h-12 animate-spin text-emerald-500" />
                  <div>
                    <h3 className="font-bold">Analyzing Claims</h3>
                    <p className="text-sm text-white/40">{loadingMsg || 'Verifying against reference context...'}</p>
                  </div>
                </div>
              ) : !result ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                  <Shield className="w-16 h-16" />
                  <p className="text-sm max-w-[200px]">Run an evaluation to see detailed grounding metrics.</p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Risk Banner */}
                  <div className={`p-4 rounded-2xl border ${
                    result.risk_analysis.risk_level === RiskLevel.LOW ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                    result.risk_analysis.risk_level === RiskLevel.MEDIUM ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                    'bg-red-500/10 border-red-500/20 text-red-500'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold flex items-center gap-2">
                        {result.risk_analysis.risk_level === RiskLevel.LOW ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {result.risk_analysis.risk_level} RISK
                      </h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{result.risk_analysis.recommended_action}</span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{result.risk_analysis.plain_english_summary}</p>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Groundedness", val: result.metrics.groundedness_score, color: "text-emerald-500" },
                      { label: "Hallucination", val: result.metrics.hallucination_rate, color: "text-red-500" },
                      { label: "Relevance", val: result.metrics.relevance_score, color: "text-blue-500" },
                      { label: "Calibration", val: result.metrics.confidence_calibration, color: "text-amber-500" }
                    ].map((m, i) => (
                      <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <div className="text-[10px] text-white/40 uppercase font-bold mb-1">{m.label}</div>
                        <div className={`text-xl font-bold ${m.color}`}>{typeof m.val === 'number' ? `${m.val}%` : m.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Claims List */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Claim Breakdown</h4>
                    {result.claims.map((claim, i) => (
                      <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-medium leading-snug">{claim.claim}</p>
                          <div className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                            claim.status === ClaimStatus.SUPPORTED ? 'bg-emerald-500/20 text-emerald-500' :
                            claim.status === ClaimStatus.IMPLIED ? 'bg-amber-500/20 text-amber-500' :
                            claim.status === ClaimStatus.CONTRADICTED ? 'bg-red-500/20 text-red-500' :
                            'bg-white/10 text-white/60'
                          }`}>
                            {claim.status}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="text-white/40">Severity: <span className={`font-bold ${
                            claim.severity === Severity.CRITICAL ? 'text-red-500' :
                            claim.severity === Severity.HIGH ? 'text-amber-500' : 'text-white/60'
                          }`}>{claim.severity}</span></span>
                          <span className="text-white/40">Confidence: <span className="text-white">{claim.confidence}%</span></span>
                        </div>

                        <div className="text-xs text-white/60 bg-white/5 p-2 rounded-lg italic">
                          "{claim.reasoning}"
                        </div>

                        {claim.recommended_fix && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> Suggested Fix
                              </span>
                              <button className="p-1 hover:bg-emerald-500/20 rounded text-emerald-500 transition-colors">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-xs text-emerald-500/90 leading-relaxed">{claim.recommended_fix}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 px-6 py-3 bg-red-500 text-white rounded-full shadow-2xl z-[100] flex items-center gap-3"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 rounded-full"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [showApp, setShowApp] = useState(false);

  return (
    <>
      {!showApp ? (
        <LandingPage onStart={() => setShowApp(true)} />
      ) : (
        <EvaluationApp />
      )}
    </>
  );
}
