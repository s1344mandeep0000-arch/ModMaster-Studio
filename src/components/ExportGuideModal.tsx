import React from 'react';
import { Download, X } from 'lucide-react';
import type { ModProject } from '../types/mod';

interface ExportGuideModalProps {
  project: ModProject;
  isOpen: boolean;
  onClose: () => void;
  onExportNow: () => void;
}

export const ExportGuideModal: React.FC<ExportGuideModalProps> = ({
  project,
  isOpen,
  onClose,
  onExportNow,
}) => {
  if (!isOpen) return null;

  const isBedrock = project.loader === 'bedrock';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#111827] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-base font-semibold text-white">
            Export &amp; Install Guide
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export guide"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="flex items-center gap-2 text-slate-400 font-mono">
            <span>{project.name}</span>
            <span aria-hidden="true">·</span>
            <span>{project.loader.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>{project.mcVersion}</span>
          </div>

          {isBedrock ? (
            <div className="space-y-2.5">
              <p>
                Your Bedrock Add-On exports as a ready-to-import{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono">
                  .mcaddon
                </code>{' '}
                archive containing both{' '}
                <code className="font-mono text-slate-200">behavior_pack/</code> and{' '}
                <code className="font-mono text-slate-200">resource_pack/</code> with rendered PNG textures.
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                <li>Download the <code className="font-mono">.mcaddon</code> package.</li>
                <li>Double-click or open it with Minecraft Bedrock Edition to import both packs.</li>
                <li>Enable both packs in World Settings and turn on Beta APIs if using <code className="font-mono">@minecraft/server</code> scripts.</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p>
                Your {project.loader.toUpperCase()} Java Edition project exports as a complete source archive with Java classes, manifests, JSON models, recipes, structures, and 16×16 PNG textures.
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                <li>Extract the downloaded <code className="font-mono">.zip</code> into a project folder.</li>
                <li>Ensure Java 21 JDK (or Java 17 for Forge 1.20.1) is installed and run Gradle wrapper setup if needed.</li>
                <li>
                  Build the compiled mod JAR with{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono">
                    ./gradlew build
                  </code>{' '}
                  and copy the output from <code className="font-mono">build/libs/</code> into your Minecraft <code className="font-mono">mods/</code> folder.
                </li>
              </ol>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 bg-[#0E131D]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onExportNow();
              onClose();
            }}
            disabled={project.files.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {isBedrock ? '.mcaddon' : '.zip'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
