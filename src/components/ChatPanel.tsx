import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { ChatMessage, GenerationProgress, ModProject } from '../types/mod';

interface ChatPanelProps {
  project: ModProject;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  livePlan: string[];
  apiConfigured: boolean | null;
  draftPrompt: string;
  onDraftPromptChange: (val: string) => void;
  onSendPrompt: (prompt: string) => void;
  onStopGeneration: () => void;
  onRetryLastError: (prompt: string) => void;
}

const STARTER_IDEAS = [
  {
    title: 'Void Crystal Arsenal & Boss',
    prompt:
      'Create a complete Void Crystal mod with Void Ore block, Void Ingot, Void Blade sword (11 attack damage + wither effect), full Void Armor set with night vision bonus, a Void Stalker mob, crafting recipes, and a Void Altar worldgen structure.',
  },
  {
    title: 'Bioluminescent Cavern & Glow Slime',
    prompt:
      'Build a Bioluminescent Cavern expansion featuring Glowshroom blocks that emit light level 13, Luminite tools, Glow Elixir item, a friendly Glow Slime mob, smelting/crafting recipes, and an underground Crystal Geode structure.',
  },
  {
    title: 'Redstone Magma Hammer & Forge Block',
    prompt:
      'Create an Ember Forge mod with a Magma Anvil block, Blaze Hammer weapon that sets targets ablaze and mines 3x3, Obsidian Plate armor, Ember Shard item, recipes, and a Ruined Smithy structure.',
  },
  {
    title: 'Bedrock Elemental Staffs Add-On',
    prompt:
      'Generate a complete Minecraft Bedrock Edition Add-On with @minecraft/server scripts: Lightning Staff, Frost Wand, Storm Crystal ore block, Guardian Golem entity, crafting recipes, and a Sky Shrine structure.',
  },
];

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-800/90 text-emerald-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function FormattedProse({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-slate-200">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="text-[14px] font-semibold text-white pt-1">
              {renderInlineFormatting(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="text-[15px] font-semibold text-white pt-1">
              {renderInlineFormatting(trimmed.slice(3))}
            </h3>
          );
        }
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-emerald-400 select-none mt-0.5">•</span>
              <span>{renderInlineFormatting(trimmed.replace(/^[-*]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-slate-400 font-mono text-xs mt-0.5 shrink-0">
                {match?.[1]}
              </span>
              <span>{renderInlineFormatting(match?.[2] || trimmed)}</span>
            </div>
          );
        }
        return <p key={i}>{renderInlineFormatting(trimmed)}</p>;
      })}
    </div>
  );
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  project,
  isGenerating,
  progress,
  livePlan,
  apiConfigured,
  draftPrompt,
  onDraftPromptChange,
  onSendPrompt,
  onStopGeneration,
  onRetryLastError,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastUserPrompt, setLastUserPrompt] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [project.messages, progress, livePlan]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = draftPrompt.trim();
    if (!trimmed || isGenerating) return;
    setLastUserPrompt(trimmed);
    onDraftPromptChange('');
    onSendPrompt(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getPreviousUserPrompt = (errorMsgIndex: number): string => {
    for (let i = errorMsgIndex - 1; i >= 0; i--) {
      if (project.messages[i].role === 'user') {
        return project.messages[i].content;
      }
    }
    return lastUserPrompt;
  };

  return (
    <section className="flex flex-col h-full min-h-0 bg-[#0B0F17]">
      {apiConfigured === false && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-lg border border-red-500/40 bg-red-950/30 flex items-start gap-3 text-sm text-red-200">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-100">Gemini API Connection Unavailable</p>
            <p className="text-xs text-red-200/80 mt-0.5">
              GEMINI_API_KEY is missing on the server. Configure it in Settings &gt; Secrets to generate and validate mods.
            </p>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-6">
        {project.messages.length === 0 && !isGenerating ? (
          <div className="max-w-2xl mx-auto pt-4 pb-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-white [text-wrap:balance]">
                Design and build complete Minecraft mods through conversation
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Describe blocks, weapons, armor, mobs, recipes, structures, or custom Bedrock scripts. Gemini plans the architecture, writes complete source files, draws 16×16 pixel textures, and validates the output.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STARTER_IDEAS.map((idea) => (
                <button
                  key={idea.title}
                  type="button"
                  onClick={() => {
                    setLastUserPrompt(idea.prompt);
                    onSendPrompt(idea.prompt);
                  }}
                  className="text-left p-4 rounded-xl border border-slate-800 bg-[#111827]/70 hover:bg-[#161F33] hover:border-slate-700 transition-colors group"
                >
                  <div className="text-sm font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                    {idea.title}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-3 leading-relaxed">
                    {idea.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {project.messages.map((msg: ChatMessage, idx: number) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-800/90 border border-slate-700/70 px-4 py-3 text-[14px] text-slate-100 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'error') {
                const retryText = getPreviousUserPrompt(idx);
                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-red-500/40 bg-red-950/25 p-4 space-y-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <div className="text-sm font-semibold text-red-200">
                          AI Generation Failed
                          {msg.errorDetails?.code ? ` (${msg.errorDetails.code})` : ''}
                        </div>
                        <p className="text-xs text-red-200/85 leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                    {retryText && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => onRetryLastError(retryText)}
                          disabled={isGenerating}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-medium text-red-100 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retry Request
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={msg.id} className="space-y-3">
                  {msg.plan && msg.plan.length > 0 && (
                    <div className="rounded-xl border border-slate-800 bg-[#111827]/70 p-3.5 space-y-2">
                      <div className="text-xs font-medium text-slate-400">
                        Execution Plan
                      </div>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {msg.plan.map((step, sIdx) => (
                          <li key={sIdx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <FormattedProse text={msg.content} />

                  {msg.appliedSummary && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono tabular-nums pt-1">
                      <span>{msg.appliedSummary.filesUpserted} files updated</span>
                      <span aria-hidden="true">·</span>
                      <span>{msg.appliedSummary.texturesGenerated} textures</span>
                      <span aria-hidden="true">·</span>
                      <span>{msg.appliedSummary.elementsUpdated} components</span>
                      {msg.appliedSummary.issuesFound > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400">
                            {msg.appliedSummary.issuesFixed}/{msg.appliedSummary.issuesFound} errors auto-fixed
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isGenerating && (
              <div className="rounded-xl border border-slate-800 bg-[#111827]/90 p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-100">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                  <span>{progress?.label || 'Connecting to Gemini AI...'}</span>
                </div>

                {livePlan.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="text-xs font-medium text-slate-400">Planned Steps</div>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {livePlan.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-emerald-400 shrink-0">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800/90 bg-[#0E131D] p-3.5 md:px-6">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-slate-700/80 bg-[#131B29] focus-within:border-emerald-500/70 transition-colors p-2.5">
            <textarea
              ref={textareaRef}
              value={draftPrompt}
              onChange={(e) => onDraftPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={
                project.files.length > 0
                  ? 'Ask Gemini to add mobs, tweak damage/recipes, fix bugs, or create new structures...'
                  : 'Describe your Minecraft mod idea (blocks, weapons, armor, mobs, structures, recipes)...'
              }
              className="w-full resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none px-1.5 py-1 leading-relaxed"
            />
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80 mt-1.5 px-1">
              <div className="text-xs text-slate-400 font-mono truncate">
                {project.loader.toUpperCase()} · {project.mcVersion} · {project.modId}
              </div>
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3 h-3 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draftPrompt.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Generate</span>
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};
