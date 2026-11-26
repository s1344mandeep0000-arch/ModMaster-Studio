import React, { useEffect, useRef, useState } from 'react';
import { Download, Menu, Plus, Trash2, X } from 'lucide-react';
import { ChatPanel } from './components/ChatPanel';
import { ExportGuideModal } from './components/ExportGuideModal';
import { WorkbenchPanel, type WorkbenchTab } from './components/WorkbenchPanel';
import type {
  ChatMessage,
  GenerationProgress,
  ModLoader,
  ModProject,
  ModTexture,
} from './types/mod';
import { exportModAsArchive } from './utils/modExport';
import {
  applyPatchToProject,
  createEmptyProject,
  LOADER_OPTIONS,
  loadProjectsFromStorage,
  saveProjectsToStorage,
} from './utils/projectStorage';

export default function App() {
  const [projects, setProjects] = useState<ModProject[]>(() => {
    const stored = loadProjectsFromStorage();
    return stored.length > 0 ? stored : [createEmptyProject('fabric', '1.21.4')];
  });
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => projects[0]?.id || ''
  );
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('files');
  const [mobilePane, setMobilePane] = useState<'chat' | 'workbench'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportGuideOpen, setExportGuideOpen] = useState(false);

  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [livePlan, setLivePlan] = useState<string[]>([]);
  const [draftPrompt, setDraftPrompt] = useState('');

  const [isValidating, setIsValidating] = useState(false);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (mounted) setApiConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (mounted) setApiConfigured(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateProject = (
    projectId: string,
    updater: (prev: ModProject) => ModProject
  ) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? updater(p) : p))
    );
  };

  const handleNewProject = () => {
    const fresh = createEmptyProject(
      activeProject?.loader || 'fabric',
      activeProject?.mcVersion || '1.21.4'
    );
    setProjects((prev) => [fresh, ...prev]);
    setActiveProjectId(fresh.id);
    setSidebarOpen(false);
    setValidationNotice(null);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (filtered.length === 0) {
        const fresh = createEmptyProject('fabric', '1.21.4');
        setActiveProjectId(fresh.id);
        return [fresh];
      }
      if (activeProjectId === id) {
        setActiveProjectId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleLoaderChange = (newLoader: ModLoader) => {
    const spec = LOADER_OPTIONS.find((l) => l.loader === newLoader);
    const defaultVer = spec?.versions[0] || '1.21.4';
    updateProject(activeProject.id, (prev) => ({
      ...prev,
      loader: newLoader,
      mcVersion: defaultVer,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleVersionChange = (newVersion: string) => {
    updateProject(activeProject.id, (prev) => ({
      ...prev,
      mcVersion: newVersion,
      updatedAt: new Date().toISOString(),
    }));
  };

  const runChatGeneration = async (promptText: string, appendUserMessage = true) => {
    if (!activeProject || isGenerating) return;

    const targetId = activeProject.id;
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: promptText,
      timestamp: new Date().toISOString(),
    };

    const projectSnapshot: ModProject = appendUserMessage
      ? {
          ...activeProject,
          messages: [...activeProject.messages, userMsg],
        }
      : activeProject;

    if (appendUserMessage) {
      updateProject(targetId, () => projectSnapshot);
    }

    setIsGenerating(true);
    setProgress({ stage: 'planning', label: 'Connecting to Gemini AI...' });
    setLivePlan([]);
    setValidationNotice(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/mod/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          project: projectSnapshot,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        const errMsg: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'error',
          content:
            errPayload.error ||
            `Server returned HTTP ${response.status} while contacting Gemini AI.`,
          timestamp: new Date().toISOString(),
          errorDetails: {
            code: errPayload.code || `HTTP_${response.status}`,
            status: response.status,
            retryable: errPayload.retryable ?? true,
          },
        };
        updateProject(targetId, (prev) => ({
          ...prev,
          messages: [...prev.messages, errMsg],
        }));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response stream unavailable.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

      const processBlock = (block: string) => {
        const lines = block.split('\n');
        let evt = currentEvent;
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            evt = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) return;
        const payload = JSON.parse(dataLines.join('\n'));

        if (evt === 'progress') {
          setProgress(payload);
        } else if (evt === 'plan') {
          setLivePlan(payload.planSteps || []);
        } else if (evt === 'complete') {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_a`,
            role: 'assistant',
            content: payload.assistantResponse,
            timestamp: new Date().toISOString(),
            plan: payload.plan,
            appliedSummary: payload.appliedSummary,
            validationIssues: payload.validationIssues,
          };

          updateProject(targetId, (prev) => {
            const patched = applyPatchToProject(
              prev,
              payload.projectPatch,
              payload.validationIssues
            );
            return {
              ...patched,
              messages: [...prev.messages, assistantMsg],
            };
          });
        } else if (evt === 'error') {
          const errMsg: ChatMessage = {
            id: `msg_${Date.now()}_err`,
            role: 'error',
            content: payload.error || 'Gemini AI generation failed.',
            timestamp: new Date().toISOString(),
            errorDetails: {
              code: payload.code,
              status: payload.status,
              retryable: payload.retryable ?? true,
            },
          };
          updateProject(targetId, (prev) => ({
            ...prev,
            messages: [...prev.messages, errMsg],
          }));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          if (chunk.trim()) {
            processBlock(chunk);
          }
        }
      }

      if (buffer.trim()) {
        processBlock(buffer);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        const cancelMsg: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'error',
          content: 'Generation was stopped before completion.',
          timestamp: new Date().toISOString(),
          errorDetails: { code: 'ABORTED', retryable: true },
        };
        updateProject(targetId, (prev) => ({
          ...prev,
          messages: [...prev.messages, cancelMsg],
        }));
      } else {
        const netErr: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'error',
          content:
            err instanceof Error
              ? `Connection error: ${err.message}`
              : 'Unable to connect to the AI backend server.',
          timestamp: new Date().toISOString(),
          errorDetails: { code: 'NETWORK_ERROR', retryable: true },
        };
        updateProject(targetId, (prev) => ({
          ...prev,
          messages: [...prev.messages, netErr],
        }));
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
      setProgress(null);
      setLivePlan([]);
    }
  };

  const handleStopGeneration = () => {
    abortRef.current?.abort();
  };

  const handleUpdateFileContent = (filePath: string, content: string) => {
    updateProject(activeProject.id, (prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.path === filePath ? { ...f, content } : f)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleUpdateTexture = (texture: ModTexture) => {
    updateProject(activeProject.id, (prev) => ({
      ...prev,
      textures: prev.textures.map((t) => (t.path === texture.path ? texture : t)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleRunValidation = async (autoFix: boolean) => {
    if (!activeProject || isValidating) return;
    setIsValidating(true);
    setValidationNotice(null);

    try {
      const response = await fetch('/api/mod/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: activeProject, autoFix }),
      });
      const data = await response.json();

      if (!response.ok) {
        setValidationNotice(data.error || 'Validation request failed.');
        if (Array.isArray(data.issues)) {
          updateProject(activeProject.id, (prev) => ({
            ...prev,
            validationIssues: data.issues,
          }));
        }
        return;
      }

      if (data.repaired) {
        updateProject(activeProject.id, (prev) =>
          applyPatchToProject(
            prev,
            {
              upsertFiles: data.upsertFiles,
              upsertTextures: data.upsertTextures,
            },
            data.issues
          )
        );
        setValidationNotice(
          `${data.repairSummary || 'Auto-repair completed.'} (${data.fixedCount || 0} issue(s) resolved)`
        );
      } else {
        updateProject(activeProject.id, (prev) => ({
          ...prev,
          validationIssues: data.issues || [],
        }));
        setValidationNotice(
          (data.issues || []).length === 0
            ? 'Static validation passed with 0 errors.'
            : `Found ${data.issues.length} issue(s). Click "Fix Issues with AI" to repair automatically.`
        );
      }
    } catch (err) {
      setValidationNotice(
        err instanceof Error ? err.message : 'Unable to reach validation endpoint.'
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleExportMod = async () => {
    if (!activeProject || activeProject.files.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const { blob, filename } = await exportModAsArchive(activeProject);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const currentLoaderSpec =
    LOADER_OPTIONS.find((l) => l.loader === activeProject.loader) || LOADER_OPTIONS[0];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-100">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0E131D] px-4 md:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle projects sidebar"
            className="lg:hidden p-1.5 rounded-md text-slate-300 hover:bg-slate-800"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <a
            href="#top"
            onClick={(e) => e.preventDefault()}
            className="font-display text-base md:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Minecraft AI Mod Studio
          </a>
        </div>

        {/* Zone 2: Single-line Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setWorkbenchTab('files')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              workbenchTab === 'files' ? 'text-white' : ''
            }`}
          >
            Codebase
          </button>
          <button
            type="button"
            onClick={() => setWorkbenchTab('textures')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              workbenchTab === 'textures' ? 'text-white' : ''
            }`}
          >
            Textures
          </button>
          <button
            type="button"
            onClick={() => setWorkbenchTab('elements')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              workbenchTab === 'elements' ? 'text-white' : ''
            }`}
          >
            Components
          </button>
          <button
            type="button"
            onClick={() => setWorkbenchTab('validator')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              workbenchTab === 'validator' ? 'text-white' : ''
            }`}
          >
            Validator
          </button>
          <button
            type="button"
            onClick={() => setExportGuideOpen(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Build Guide
          </button>
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportMod}
            disabled={activeProject.files.length === 0 || isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isExporting
                ? 'Packaging...'
                : activeProject.loader === 'bedrock'
                  ? 'Export .mcaddon'
                  : 'Export Mod'}
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Pane Switcher */}
      <div className="md:hidden flex items-center gap-1 p-1.5 border-b border-slate-800 bg-[#0E131D]">
        <button
          type="button"
          onClick={() => setMobilePane('chat')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium ${
            mobilePane === 'chat' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          AI Chat
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('workbench')}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium ${
            mobilePane === 'workbench' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          Mod Workspace ({activeProject.files.length})
        </button>
      </div>

      {/* Main Studio Shell */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Left Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'flex absolute inset-y-0 left-0 z-40' : 'hidden'
          } lg:flex flex-col w-[260px] shrink-0 border-r border-slate-800/90 bg-[#0E131D] min-h-0`}
        >
          <div className="p-3.5 border-b border-slate-800/80">
            <button
              type="button"
              onClick={handleNewProject}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-semibold text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Mod Project</span>
            </button>
          </div>

          {/* Target Loader & Version Config */}
          <div className="p-3.5 border-b border-slate-800/80 space-y-3">
            <div>
              <label
                htmlFor="loader-select"
                className="block text-[11px] font-medium text-slate-400 mb-1.5"
              >
                Target Edition / Loader
              </label>
              <select
                id="loader-select"
                value={activeProject.loader}
                onChange={(e) => handleLoaderChange(e.target.value as ModLoader)}
                disabled={isGenerating}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-700/80 bg-[#131B29] text-xs text-slate-100 focus:outline-none focus:border-emerald-500/70"
              >
                {LOADER_OPTIONS.map((opt) => (
                  <option key={opt.loader} value={opt.loader}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="version-select"
                className="block text-[11px] font-medium text-slate-400 mb-1.5"
              >
                Minecraft Version
              </label>
              <select
                id="version-select"
                value={activeProject.mcVersion}
                onChange={(e) => handleVersionChange(e.target.value)}
                disabled={isGenerating}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-700/80 bg-[#131B29] text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/70"
              >
                {currentLoaderSpec.versions.map((ver) => (
                  <option key={ver} value={ver}>
                    {ver}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Saved Projects List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1">
            <div className="px-2 py-1 text-[11px] font-medium text-slate-500">
              Mod Projects
            </div>
            {projects.map((proj) => {
              const isActive = proj.id === activeProject.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    setActiveProjectId(proj.id);
                    setSidebarOpen(false);
                    setValidationNotice(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveProjectId(proj.id);
                      setSidebarOpen(false);
                    }
                  }}
                  className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-slate-800/90 text-white'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{proj.name}</div>
                    <div className="font-mono text-[10px] text-slate-500 truncate mt-0.5 tabular-nums">
                      {proj.loader} · {proj.mcVersion} · {proj.files.length} files
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteProject(proj.id, e)}
                    aria-label={`Delete ${proj.name}`}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-300 transition-opacity shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Chat + Right Workbench Grid */}
        <main className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 min-h-0">
          <div
            className={`${
              mobilePane === 'chat' ? 'flex' : 'hidden'
            } md:flex flex-col min-h-0`}
          >
            <ChatPanel
              project={activeProject}
              isGenerating={isGenerating}
              progress={progress}
              livePlan={livePlan}
              apiConfigured={apiConfigured}
              draftPrompt={draftPrompt}
              onDraftPromptChange={setDraftPrompt}
              onSendPrompt={(text) => runChatGeneration(text, true)}
              onStopGeneration={handleStopGeneration}
              onRetryLastError={(text) => runChatGeneration(text, false)}
            />
          </div>

          <div
            className={`${
              mobilePane === 'workbench' ? 'flex' : 'hidden'
            } md:flex flex-col min-h-0`}
          >
            <WorkbenchPanel
              project={activeProject}
              activeTab={workbenchTab}
              onTabChange={setWorkbenchTab}
              onUpdateFileContent={handleUpdateFileContent}
              onUpdateTexture={handleUpdateTexture}
              onAskAiAboutItem={(prefill) => {
                setDraftPrompt(prefill);
                setMobilePane('chat');
              }}
              onRunValidation={handleRunValidation}
              isValidating={isValidating}
              validationNotice={validationNotice}
            />
          </div>
        </main>
      </div>

      <ExportGuideModal
        project={activeProject}
        isOpen={exportGuideOpen}
        onClose={() => setExportGuideOpen(false)}
        onExportNow={handleExportMod}
      />
    </div>
  );
}
