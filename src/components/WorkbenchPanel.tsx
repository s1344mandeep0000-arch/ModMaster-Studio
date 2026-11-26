import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FolderOpen,
  Layers,
  Loader2,
  Palette,
  Search,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import type {
  ModElement,
  ModFile,
  ModProject,
  ModTexture,
  ValidationIssue,
} from '../types/mod';
import { renderTextureToDataUrl } from '../utils/modExport';
import { IsometricBlockPreview, TextureCanvas } from './TextureCanvas';

export type WorkbenchTab = 'files' | 'textures' | 'elements' | 'validator';

interface WorkbenchPanelProps {
  project: ModProject;
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  onUpdateFileContent: (path: string, content: string) => void;
  onUpdateTexture: (texture: ModTexture) => void;
  onAskAiAboutItem: (promptText: string) => void;
  onRunValidation: (autoFix: boolean) => Promise<void>;
  isValidating: boolean;
  validationNotice: string | null;
}

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  project,
  activeTab,
  onTabChange,
  onUpdateFileContent,
  onUpdateTexture,
  onAskAiAboutItem,
  onRunValidation,
  isValidating,
  validationNotice,
}) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [fileSearch, setFileSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [selectedTexturePath, setSelectedTexturePath] = useState<string>('');
  const [activeSymbol, setActiveSymbol] = useState<string>('');
  const [elementFilter, setElementFilter] = useState<string>('all');

  useEffect(() => {
    if (
      project.files.length > 0 &&
      (!selectedFilePath || !project.files.some((f) => f.path === selectedFilePath))
    ) {
      const preferred =
        project.files.find((f) => f.path.endsWith('.java') || f.path.endsWith('main.js')) ||
        project.files[0];
      setSelectedFilePath(preferred.path);
    } else if (project.files.length === 0) {
      setSelectedFilePath('');
    }
  }, [project.files, selectedFilePath]);

  useEffect(() => {
    if (
      project.textures.length > 0 &&
      (!selectedTexturePath ||
        !project.textures.some((t) => t.path === selectedTexturePath))
    ) {
      setSelectedTexturePath(project.textures[0].path);
    } else if (project.textures.length === 0) {
      setSelectedTexturePath('');
    }
  }, [project.textures, selectedTexturePath]);

  const selectedFile: ModFile | undefined = useMemo(
    () => project.files.find((f) => f.path === selectedFilePath),
    [project.files, selectedFilePath]
  );

  const selectedTexture: ModTexture | undefined = useMemo(
    () => project.textures.find((t) => t.path === selectedTexturePath),
    [project.textures, selectedTexturePath]
  );

  useEffect(() => {
    if (selectedTexture) {
      const keys = Object.keys(selectedTexture.palette || {}).filter(
        (k) => selectedTexture.palette[k] !== 'transparent'
      );
      if (keys.length > 0 && !selectedTexture.palette?.[activeSymbol]) {
        setActiveSymbol(keys[0]);
      }
    }
  }, [selectedTexture, activeSymbol]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return project.files;
    return project.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [project.files, fileSearch]);

  const filteredElements = useMemo(() => {
    if (elementFilter === 'all') return project.elements;
    if (elementFilter === 'gear') {
      return project.elements.filter((e) => e.type === 'weapon' || e.type === 'armor');
    }
    if (elementFilter === 'world') {
      return project.elements.filter(
        (e) => e.type === 'recipe' || e.type === 'structure' || e.type === 'script'
      );
    }
    return project.elements.filter((e) => e.type === elementFilter);
  }, [project.elements, elementFilter]);

  const errorCount = project.validationIssues.filter((i) => i.severity === 'error').length;
  const warningCount = project.validationIssues.filter((i) => i.severity === 'warning').length;

  const handleCopyFile = async (file: ModFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedPath(file.path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handlePaintPixel = (x: number, y: number) => {
    if (!selectedTexture || !activeSymbol) return;
    const rows = [...(selectedTexture.rows || Array(16).fill('................'))];
    const row = (rows[y] || '').padEnd(16, '.');
    rows[y] = row.slice(0, x) + activeSymbol + row.slice(x + 1);
    onUpdateTexture({ ...selectedTexture, rows });
  };

  const handleDownloadTexturePng = (tex: ModTexture) => {
    const dataUrl = renderTextureToDataUrl(tex, 1);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = tex.path.split('/').pop() || `${tex.name}.png`;
    a.click();
  };

  const textureMap = useMemo(
    () => new Map(project.textures.map((t) => [t.path, t])),
    [project.textures]
  );

  return (
    <section className="flex flex-col h-full min-h-0 bg-[#0E131D] border-l border-slate-800/90">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-slate-800/90 bg-[#111827]/70">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => onTabChange('files')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'files'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Files ({project.files.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('textures')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'textures'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Textures ({project.textures.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('elements')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'elements'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Components ({project.elements.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('validator')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'validator'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              Validator
              {errorCount > 0 ? ` (${errorCount} err)` : warningCount > 0 ? ` (${warningCount})` : ''}
            </span>
          </button>
        </div>
      </div>

      {project.files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700/70 flex items-center justify-center mb-4">
            <FolderOpen className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-100">
            Mod Workspace Ready
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
            Send a prompt in the chat panel to generate Java or Bedrock source files, 16×16 pixel textures, 3D models, recipes, and validation reports here.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeTab === 'files' && (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[240px_1fr]">
              <div className="border-b lg:border-b-0 lg:border-r border-slate-800/90 flex flex-col min-h-0 max-h-56 lg:max-h-none bg-[#0B0F17]/60">
                <div className="p-2.5 border-b border-slate-800/80">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      placeholder="Filter files..."
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#111827] border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredFiles.map((file) => {
                    const active = file.path === selectedFilePath;
                    const parts = file.path.split('/');
                    const name = parts.pop() || file.path;
                    const dir = parts.join('/');
                    const hasIssue = project.validationIssues.some(
                      (i) => i.filePath === file.path && i.severity === 'error'
                    );
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setSelectedFilePath(file.path)}
                        title={file.path}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-mono text-[12px] truncate">{name}</span>
                          {hasIssue && (
                            <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                          )}
                        </div>
                        {dir && (
                          <div className="font-mono text-[10px] text-slate-500 truncate">
                            {dir}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedFile ? (
                <div className="flex flex-col min-h-0 bg-[#0A0E16]">
                  <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-800/90 bg-[#0E131D]">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-slate-200 truncate">
                        {selectedFile.path}
                      </div>
                      {selectedFile.summary && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {selectedFile.summary}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onAskAiAboutItem(
                            `Update the file \`${selectedFile.path}\` to: `
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-600 bg-slate-800/70 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Wand2 className="w-3 h-3 text-emerald-400" />
                        <span>Edit with AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyFile(selectedFile)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-600 bg-slate-800/70 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        {copiedPath === selectedFile.path ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={selectedFile.content}
                    onChange={(e) =>
                      onUpdateFileContent(selectedFile.path, e.target.value)
                    }
                    spellCheck={false}
                    className="flex-1 w-full p-4 bg-transparent font-mono text-[12px] leading-relaxed text-slate-200 focus:outline-none resize-none"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center text-xs text-slate-500">
                  Select a file to inspect or edit.
                </div>
              )}
            </div>
          )}

          {activeTab === 'textures' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
              {project.textures.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  No 16×16 pixel textures generated yet. Ask Gemini to add items, blocks, armor, or mobs with textures.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {project.textures.map((tex) => {
                      const active = tex.path === selectedTexturePath;
                      return (
                        <button
                          key={tex.path}
                          type="button"
                          onClick={() => setSelectedTexturePath(tex.path)}
                          className={`p-3 rounded-xl border text-left transition-colors flex items-center gap-3 ${
                            active
                              ? 'border-emerald-500/70 bg-emerald-500/10'
                              : 'border-slate-800 bg-[#111827]/70 hover:border-slate-700'
                          }`}
                        >
                          <TextureCanvas texture={tex} size={48} />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-100 truncate">
                              {tex.name}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 truncate mt-0.5">
                              {tex.path.split('/').pop()}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTexture && (
                    <div className="rounded-xl border border-slate-800 bg-[#111827]/60 p-5 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">
                            {selectedTexture.name} · 16×16 Pixel Editor
                          </h3>
                          <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                            {selectedTexture.path}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onAskAiAboutItem(
                                `Redesign the 16x16 texture \`${selectedTexture.path}\` to look more detailed with `
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Regenerate with AI</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadTexturePng(selectedTexture)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Save PNG</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-8">
                        <TextureCanvas
                          texture={selectedTexture}
                          size={224}
                          interactive
                          onPaintPixel={handlePaintPixel}
                        />

                        <div className="flex-1 min-w-[220px] space-y-4">
                          <div>
                            <div className="text-xs font-medium text-slate-300 mb-2">
                              Palette Swatches (click grid to paint)
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(selectedTexture.palette || {}).map(
                                ([sym, hex]) => (
                                  <button
                                    key={sym}
                                    type="button"
                                    onClick={() => setActiveSymbol(sym)}
                                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-mono transition-colors ${
                                      activeSymbol === sym
                                        ? 'border-emerald-500 bg-emerald-500/15 text-white'
                                        : 'border-slate-700 bg-slate-900 text-slate-300'
                                    }`}
                                  >
                                    <span
                                      className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                                      style={{
                                        backgroundColor:
                                          hex === 'transparent' ? 'transparent' : hex,
                                      }}
                                    />
                                    <span>{hex === 'transparent' ? 'Erase' : hex}</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center gap-5">
                            <IsometricBlockPreview texture={selectedTexture} />
                            <div className="text-xs text-slate-400 leading-relaxed">
                              <div className="font-medium text-slate-200 mb-1">
                                3D Block Projection
                              </div>
                              Live isometric cube preview rendered directly from the 16×16 pixel array. Exported archives convert all textures into standard PNG files.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'elements' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800 w-fit">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'block', label: 'Blocks' },
                  { id: 'gear', label: 'Weapons & Armor' },
                  { id: 'item', label: 'Items' },
                  { id: 'mob', label: 'Mobs' },
                  { id: 'world', label: 'Recipes & Structures' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setElementFilter(f.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      elementFilter === f.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredElements.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  No components match this filter yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {filteredElements.map((el: ModElement) => {
                    const tex = el.texturePath ? textureMap.get(el.texturePath) : undefined;
                    return (
                      <div
                        key={el.id || el.identifier}
                        className="rounded-xl border border-slate-800 bg-[#111827]/70 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {tex && <TextureCanvas texture={tex} size={48} />}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {el.name}
                              </div>
                              <div className="text-xs text-slate-400 font-mono truncate">
                                {el.type} · {el.identifier}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onAskAiAboutItem(
                                `Modify "${el.name}" (${el.identifier}): `
                              )
                            }
                            className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-600 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                          >
                            Modify
                          </button>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {el.description}
                        </p>

                        {el.stats && el.stats.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                            {el.stats.map((st, idx) => (
                              <div key={idx} className="text-xs">
                                <span className="text-slate-500">{st.label}: </span>
                                <span className="font-mono text-slate-200 tabular-nums">
                                  {st.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {el.recipe && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-2">
                            <div className="text-[11px] font-medium text-slate-400">
                              Crafting Recipe ({el.recipe.type})
                            </div>
                            {el.recipe.pattern && el.recipe.key ? (
                              <div className="flex items-center gap-4">
                                <div className="grid grid-cols-3 gap-1 p-1.5 rounded-lg bg-[#0B0F17] border border-slate-800">
                                  {[0, 1, 2].map((r) =>
                                    [0, 1, 2].map((c) => {
                                      const sym = el.recipe?.pattern?.[r]?.[c] || ' ';
                                      const item = sym !== ' ' ? el.recipe?.key?.[sym] : '';
                                      const shortName = item
                                        ? item.split(':').pop()?.slice(0, 6)
                                        : '';
                                      return (
                                        <div
                                          key={`${r}-${c}`}
                                          title={item || 'Empty'}
                                          className="w-9 h-9 rounded bg-slate-900 border border-slate-800 flex items-center justify-center font-mono text-[9px] text-slate-300 text-center px-0.5"
                                        >
                                          {shortName}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 font-mono">
                                  → {el.recipe.result}
                                  {el.recipe.count && el.recipe.count > 1
                                    ? ` ×${el.recipe.count}`
                                    : ''}
                                </div>
                              </div>
                            ) : (
                              <div className="font-mono text-xs text-slate-300">
                                {(el.recipe.ingredients || []).join(' + ')} →{' '}
                                {el.recipe.result}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'validator' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">
                    Mod Syntax, Schema &amp; Reference Validator
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span className={errorCount > 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {errorCount} errors
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={warningCount > 0 ? 'text-amber-400' : 'text-slate-400'}>
                      {warningCount} warnings
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{project.files.length} files scanned</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRunValidation(false)}
                    disabled={isValidating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Re-check</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunValidation(true)}
                    disabled={isValidating || project.validationIssues.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {isValidating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    <span>Fix Issues with AI</span>
                  </button>
                </div>
              </div>

              {validationNotice && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-xs text-slate-200">
                  {validationNotice}
                </div>
              )}

              {project.validationIssues.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-200">
                      All Checks Passed
                    </div>
                    <p className="text-xs text-emerald-200/80 mt-1">
                      JSON schemas, loader manifests, Java package/class declarations, recipe keys, and texture grids validated cleanly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {project.validationIssues.map((issue: ValidationIssue) => (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-slate-800 bg-[#111827]/70 p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            issue.severity === 'error'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`font-semibold ${
                                issue.severity === 'error'
                                  ? 'text-red-300'
                                  : 'text-amber-300'
                              }`}
                            >
                              {issue.severity === 'error' ? 'Error' : 'Warning'}
                            </span>
                            <span className="text-slate-500" aria-hidden="true">
                              ·
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  project.files.some((f) => f.path === issue.filePath)
                                ) {
                                  setSelectedFilePath(issue.filePath);
                                  onTabChange('files');
                                }
                              }}
                              className="font-mono text-slate-200 hover:text-emerald-400 underline-offset-2 hover:underline truncate"
                            >
                              {issue.filePath}
                            </button>
                            <span className="text-slate-500" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono text-slate-400">{issue.rule}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {issue.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
