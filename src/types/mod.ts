export type ModLoader = 'fabric' | 'neoforge' | 'forge' | 'bedrock';

export type ModElementType =
  | 'block'
  | 'weapon'
  | 'armor'
  | 'item'
  | 'mob'
  | 'recipe'
  | 'structure'
  | 'script';

export type FileLanguage =
  | 'java'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'toml'
  | 'gradle'
  | 'properties'
  | 'lang'
  | 'mcfunction'
  | 'text';

export interface ModFile {
  path: string;
  content: string;
  language: FileLanguage;
  summary?: string;
}

export interface ModTexture {
  path: string;
  name: string;
  elementId?: string;
  width: 16;
  height: 16;
  palette: Record<string, string>;
  rows: string[];
}

export interface ModRecipeDefinition {
  type: 'shaped' | 'shapeless' | 'smelting';
  pattern?: string[];
  key?: Record<string, string>;
  ingredients?: string[];
  result: string;
  count?: number;
}

export interface ModElementStat {
  label: string;
  value: string;
}

export interface ModElement {
  id: string;
  name: string;
  type: ModElementType;
  description: string;
  identifier: string;
  stats?: ModElementStat[];
  recipe?: ModRecipeDefinition;
  texturePath?: string;
  modelPath?: string;
  filePaths?: string[];
}

export interface ValidationIssue {
  id: string;
  filePath: string;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  autoFixed?: boolean;
}

export interface AppliedSummary {
  filesUpserted: number;
  filesDeleted: number;
  texturesGenerated: number;
  elementsUpdated: number;
  issuesFound: number;
  issuesFixed: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: string;
  plan?: string[];
  appliedSummary?: AppliedSummary;
  validationIssues?: ValidationIssue[];
  errorDetails?: {
    code?: string;
    status?: number;
    retryable?: boolean;
  };
}

export interface ModProject {
  id: string;
  name: string;
  modId: string;
  namespace: string;
  loader: ModLoader;
  mcVersion: string;
  description: string;
  files: ModFile[];
  textures: ModTexture[];
  elements: ModElement[];
  validationIssues: ValidationIssue[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerationProgress {
  stage: 'planning' | 'generating' | 'textures' | 'validating' | 'fixing' | 'complete';
  label: string;
  detail?: string;
}
