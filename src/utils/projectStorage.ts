import type {
  ModElement,
  ModFile,
  ModLoader,
  ModProject,
  ModTexture,
  ValidationIssue,
} from '../types/mod';

const STORAGE_KEY = 'mc_ai_mod_studio_projects_v1';

export const LOADER_OPTIONS: Array<{
  loader: ModLoader;
  label: string;
  versions: string[];
  description: string;
}> = [
  {
    loader: 'fabric',
    label: 'Fabric',
    versions: ['1.21.4', '1.21.1', '1.20.4'],
    description: 'Lightweight Java Edition loader using Fabric API & Mixins.',
  },
  {
    loader: 'neoforge',
    label: 'NeoForge',
    versions: ['1.21.4', '1.21.1'],
    description: 'Modern Java Edition loader with DeferredRegister & DataMaps.',
  },
  {
    loader: 'forge',
    label: 'Forge',
    versions: ['1.20.1', '1.20.4'],
    description: 'Classic Java Edition loader for 1.20.x modpacks.',
  },
  {
    loader: 'bedrock',
    label: 'Bedrock Add-On',
    versions: ['1.21.50', '1.21.40'],
    description: 'Cross-platform Behavior + Resource Pack (.mcaddon) with Script API.',
  },
];

export function createEmptyProject(
  loader: ModLoader = 'fabric',
  mcVersion = '1.21.4'
): ModProject {
  const now = new Date().toISOString();
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: 'Untitled Mod Project',
    modId: 'custom_mod',
    namespace: 'custom_mod',
    loader,
    mcVersion,
    description: 'Describe your mod idea in chat to generate complete code, textures, and assets.',
    files: [],
    textures: [],
    elements: [],
    validationIssues: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadProjectsFromStorage(): ModProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectsToStorage(projects: ModProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 20)));
  } catch {
    // Ignore storage quota errors silently
  }
}

export interface ProjectPatchPayload {
  name?: string;
  modId?: string;
  namespace?: string;
  description?: string;
  upsertFiles?: ModFile[];
  deleteFiles?: string[];
  upsertTextures?: ModTexture[];
  upsertElements?: ModElement[];
}

export function applyPatchToProject(
  project: ModProject,
  patch: ProjectPatchPayload,
  validationIssues?: ValidationIssue[]
): ModProject {
  const fileMap = new Map<string, ModFile>();
  for (const f of project.files) {
    fileMap.set(f.path, f);
  }
  for (const del of patch.deleteFiles || []) {
    fileMap.delete(del);
  }
  for (const f of patch.upsertFiles || []) {
    if (f.path) fileMap.set(f.path, f);
  }

  const textureMap = new Map<string, ModTexture>();
  for (const t of project.textures) {
    textureMap.set(t.path, t);
  }
  for (const t of patch.upsertTextures || []) {
    if (t.path) textureMap.set(t.path, t);
  }

  const elementMap = new Map<string, ModElement>();
  for (const el of project.elements) {
    elementMap.set(el.id || el.identifier, el);
  }
  for (const el of patch.upsertElements || []) {
    if (el.id || el.identifier) {
      elementMap.set(el.id || el.identifier, el);
    }
  }

  return {
    ...project,
    name: patch.name || project.name,
    modId: patch.modId || project.modId,
    namespace: patch.namespace || patch.modId || project.namespace,
    description: patch.description || project.description,
    files: Array.from(fileMap.values()).sort((a, b) => a.path.localeCompare(b.path)),
    textures: Array.from(textureMap.values()).sort((a, b) => a.path.localeCompare(b.path)),
    elements: Array.from(elementMap.values()),
    validationIssues: validationIssues ?? project.validationIssues,
    updatedAt: new Date().toISOString(),
  };
}
