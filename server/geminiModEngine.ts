import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ChatMessage,
  FileLanguage,
  ModElement,
  ModElementType,
  ModFile,
  ModLoader,
  ModProject,
  ModTexture,
  ValidationIssue,
} from '../src/types/mod.ts';

const MODEL_NAME = 'gemini-4-hydrogen';

export class GeminiEngineError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(message: string, status = 502, code = 'GEMINI_API_ERROR', retryable = true) {
    super(message);
    this.name = 'GeminiEngineError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function isApiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiEngineError(
      'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI mod generation.',
      503,
      'API_KEY_MISSING',
      false
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function classifyGeminiError(err: unknown): GeminiEngineError {
  if (err instanceof GeminiEngineError) return err;

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key')
  ) {
    return new GeminiEngineError(
      'Gemini API rejected the configured key (API_KEY_INVALID). Check GEMINI_API_KEY in Settings > Secrets.',
      401,
      'API_KEY_INVALID',
      false
    );
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return new GeminiEngineError(
      'Gemini API access was denied (PERMISSION_DENIED). Verify the API key permissions in Settings > Secrets.',
      403,
      'PERMISSION_DENIED',
      false
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return new GeminiEngineError(
      'Gemini API rate limit or quota exceeded (429 RESOURCE_EXHAUSTED). Please wait a moment and try again.',
      429,
      'RESOURCE_EXHAUSTED',
      true
    );
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return new GeminiEngineError(
      `Gemini model "${MODEL_NAME}" was not found or is unavailable for this key.`,
      404,
      'MODEL_NOT_FOUND',
      false
    );
  }
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('network')
  ) {
    return new GeminiEngineError(
      'Unable to reach the Gemini API service due to a network or connection error. Check connectivity and retry.',
      503,
      'CONNECTION_UNAVAILABLE',
      true
    );
  }

  return new GeminiEngineError(
    `Gemini API request failed: ${rawMsg}`,
    502,
    'GEMINI_UPSTREAM_ERROR',
    true
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt === maxRetries) {
        throw classified;
      }
      const delayMs = 700 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw classifyGeminiError(lastErr);
}

function getLoaderSpecification(loader: ModLoader, mcVersion: string): string {
  switch (loader) {
    case 'fabric':
      return `Target: Minecraft Java Edition ${mcVersion} — Fabric Mod Loader.
Required conventions:
- Include src/main/resources/fabric.mod.json (schemaVersion 1, valid id, entrypoints.main, depends.fabricloader & minecraft & fabric-api)
- Include build.gradle and gradle.properties if creating a new mod
- Java package com.modstudio.<modid> under src/main/java/com/modstudio/<modid>/
- Use net.fabricmc.api.ModInitializer, net.minecraft.registry.Registries, net.minecraft.registry.Registry, net.minecraft.util.Identifier
- Generate custom Block/SwordItem/ArmorItem/ArmorMaterial/EntityType/Structure classes as requested
- Resource pack assets under src/main/resources/assets/<modid>/: blockstates/*.json, models/block/*.json, models/item/*.json, lang/en_us.json
- Data pack assets under src/main/resources/data/<modid>/: recipe/*.json (1.21+ uses singular "recipe", "loot_table"), loot_table/blocks/*.json, worldgen/structure/*.json, worldgen/structure_set/*.json`;

    case 'neoforge':
      return `Target: Minecraft Java Edition ${mcVersion} — NeoForge Mod Loader.
Required conventions:
- Include src/main/resources/META-INF/neoforge.mods.toml with modLoader="javafml", valid modId, displayName, and [[dependencies.<modid>]]
- Include build.gradle and gradle.properties if creating a new mod
- Java package com.modstudio.<modid> under src/main/java/com/modstudio/<modid>/
- Use @Mod("<modid>"), IEventBus, DeferredRegister.Blocks, DeferredRegister.Items, DeferredRegister<EntityType<?>> (net.neoforged.neoforge.registries.DeferredRegister)
- Resource pack assets under src/main/resources/assets/<modid>/: blockstates/*.json, models/block/*.json, models/item/*.json, lang/en_us.json
- Data pack assets under src/main/resources/data/<modid>/: recipe/*.json, loot_table/blocks/*.json, worldgen/structure/*.json`;

    case 'forge':
      return `Target: Minecraft Java Edition ${mcVersion} — Minecraft Forge Mod Loader.
Required conventions:
- Include src/main/resources/META-INF/mods.toml with modLoader="javafml", valid modId, displayName, and [[dependencies.<modid>]]
- Include build.gradle and gradle.properties if creating a new mod
- Java package com.modstudio.<modid> under src/main/java/com/modstudio/<modid>/
- Use @Mod("<modid>"), FMLJavaModLoadingContext.get().getModEventBus(), DeferredRegister.create(ForgeRegistries.BLOCKS / ITEMS / ENTITY_TYPES, MODID)
- Resource pack assets under src/main/resources/assets/<modid>/: blockstates/*.json, models/block/*.json, models/item/*.json, lang/en_us.json
- Data pack assets under src/main/resources/data/<modid>/: recipes/*.json, loot_tables/blocks/*.json, worldgen/structure/*.json`;

    case 'bedrock':
      return `Target: Minecraft Bedrock Edition ${mcVersion} — Behavior Pack + Resource Pack Add-On (.mcaddon).
Required conventions:
- behavior_pack/manifest.json with valid UUIDv4 header.uuid, modules (data + script module with "@minecraft/server"), and dependencies linking resource_pack UUID
- resource_pack/manifest.json with valid UUIDv4 header.uuid and resources module
- behavior_pack/scripts/main.js using real "@minecraft/server" imports (import { world, system } from "@minecraft/server";) for custom weapon/armor/block/mob abilities
- behavior_pack/items/*.json, behavior_pack/blocks/*.json, behavior_pack/entities/*.json, behavior_pack/recipes/*.json, behavior_pack/structures/*.json or features/*.json (all with valid format_version e.g. "1.21.50")
- resource_pack/textures/item_texture.json, resource_pack/textures/terrain_texture.json, resource_pack/blocks.json, resource_pack/models/entity/*.geo.json, resource_pack/entity/*.entity.json, resource_pack/texts/en_US.lang`;
  }
}

function buildConversationContext(messages: ChatMessage[], project: ModProject): string {
  const recentMessages = messages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 1200),
  }));

  const fileSummary = project.files.map((f) => {
    const isCodeOrConfig =
      f.path.endsWith('.java') ||
      f.path.endsWith('.js') ||
      f.path.endsWith('.ts') ||
      f.path.endsWith('.json') ||
      f.path.endsWith('.toml');
    const maxLen = project.files.length > 20 ? 1200 : 3500;
    return {
      path: f.path,
      content: isCodeOrConfig ? f.content.slice(0, maxLen) : f.content.slice(0, 800),
    };
  });

  return JSON.stringify(
    {
      currentProject: {
        name: project.name,
        modId: project.modId,
        loader: project.loader,
        mcVersion: project.mcVersion,
        description: project.description,
        existingElements: project.elements.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          identifier: e.identifier,
        })),
        existingTextures: project.textures.map((t) => t.path),
        existingFiles: fileSummary,
      },
      recentConversation: recentMessages,
    },
    null,
    2
  );
}

export interface ModPlanResult {
  modName: string;
  modId: string;
  description: string;
  planSteps: string[];
}

export async function planModWithGemini(
  prompt: string,
  project: ModProject
): Promise<ModPlanResult> {
  const ai = getClient();
  const loaderSpec = getLoaderSpecification(project.loader, project.mcVersion);

  const systemInstruction = `You are a senior Minecraft mod architect.
Analyze the user's request and the current project state, then produce a concise, concrete implementation plan for the mod or add-on update.
${loaderSpec}
Rules:
- modId must be lowercase alphanumeric + underscores (2-24 chars), matching existing modId "${project.modId}" if the project already has files unless the user explicitly asks to rename it.
- planSteps should be 4-6 clear, actionable steps covering code, textures, models, recipes, structures, and validation.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `User Request: ${prompt}\n\nProject Context:\n${buildConversationContext(
        project.messages,
        project
      )}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            modName: { type: Type.STRING },
            modId: { type: Type.STRING },
            description: { type: Type.STRING },
            planSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['modName', 'modId', 'description', 'planSteps'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return {
      modName: parsed.modName || project.name || 'Custom Mod',
      modId:
        (parsed.modId || project.modId || 'custom_mod')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_') || 'custom_mod',
      description: parsed.description || project.description || prompt,
      planSteps: Array.isArray(parsed.planSteps) ? parsed.planSteps : [],
    };
  });
}

export interface ModGenerationResult {
  assistantResponse: string;
  name: string;
  modId: string;
  description: string;
  upsertFiles: ModFile[];
  deleteFiles: string[];
  upsertTextures: ModTexture[];
  upsertElements: ModElement[];
}

export async function generateModFilesWithGemini(
  prompt: string,
  project: ModProject,
  plan: ModPlanResult
): Promise<ModGenerationResult> {
  const ai = getClient();
  const loaderSpec = getLoaderSpecification(project.loader, project.mcVersion);

  const systemInstruction = `You are an expert Minecraft Mod & Add-On Engineer generating real, complete, syntactically valid Minecraft mod files, textures, models, recipes, and structures.
${loaderSpec}

CRITICAL OUTPUT RULES:
1. Generate COMPLETE file contents — never use "// TODO", placeholders, or truncated code.
2. When modifying an existing project, preserve working files and emit only new or updated files in upsertFiles (plus any obsolete paths in deleteFiles). When creating a new project, generate the full mod skeleton + all requested blocks, weapons, armor, items, mobs, recipes, structures, models, and textures.
3. Textures: For every block, item, weapon, armor piece, or mob icon, generate a crisp 16x16 pixel-art texture in upsertTextures!
   - Use "paletteEntries": array of { symbol: single-char string (e.g. "#", "A", "B", "."), hex: "#RRGGBB" or "transparent" }.
   - Use "rows": exactly 16 strings, each exactly 16 characters long, forming recognizable pixel art.
   - Texture "path" must match the exact asset path used in your JSON models / item_texture.json / terrain_texture.json.
4. Elements: Populate upsertElements for every block, weapon, armor, item, mob, recipe, and structure so the user can inspect stats, crafting recipes (3x3 pattern + keyEntries), and linked textures/files.
5. Recipes & Structures: Include real Minecraft recipe JSONs and structure/worldgen JSONs whenever requested or appropriate for progression.
6. Validation-Ready: Ensure all JSON files are strictly valid JSON, all Java class names match their filenames, all package declarations match directory paths, and all Bedrock manifest UUIDs are valid v4 UUIDs.`;

  const userPayload = `User Request: ${prompt}

Approved Architectural Plan:
- Mod Name: ${plan.modName}
- Mod ID: ${plan.modId}
- Summary: ${plan.description}
- Steps:
${plan.planSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Current Project State & Conversation History:
${buildConversationContext(project.messages, project)}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: userPayload,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            assistantResponse: { type: Type.STRING },
            name: { type: Type.STRING },
            modId: { type: Type.STRING },
            description: { type: Type.STRING },
            upsertFiles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  content: { type: Type.STRING },
                  language: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['path', 'content', 'language'],
              },
            },
            deleteFiles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            upsertTextures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  name: { type: Type.STRING },
                  elementId: { type: Type.STRING },
                  paletteEntries: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        symbol: { type: Type.STRING },
                        hex: { type: Type.STRING },
                      },
                      required: ['symbol', 'hex'],
                    },
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['path', 'name', 'paletteEntries', 'rows'],
              },
            },
            upsertElements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                  identifier: { type: Type.STRING },
                  texturePath: { type: Type.STRING },
                  modelPath: { type: Type.STRING },
                  filePaths: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  stats: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.STRING },
                      },
                      required: ['label', 'value'],
                    },
                  },
                  recipe: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      pattern: { type: Type.ARRAY, items: { type: Type.STRING } },
                      keyEntries: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            symbol: { type: Type.STRING },
                            item: { type: Type.STRING },
                          },
                          required: ['symbol', 'item'],
                        },
                      },
                      ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                      result: { type: Type.STRING },
                      count: { type: Type.INTEGER },
                    },
                    required: ['type', 'result'],
                  },
                },
                required: ['id', 'name', 'type', 'description', 'identifier'],
              },
            },
          },
          required: [
            'assistantResponse',
            'name',
            'modId',
            'description',
            'upsertFiles',
            'deleteFiles',
            'upsertTextures',
            'upsertElements',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());

    const allowedLangs = new Set<FileLanguage>([
      'java',
      'json',
      'javascript',
      'typescript',
      'toml',
      'gradle',
      'properties',
      'lang',
      'mcfunction',
      'text',
    ]);

    const allowedElementTypes = new Set<ModElementType>([
      'block',
      'weapon',
      'armor',
      'item',
      'mob',
      'recipe',
      'structure',
      'script',
    ]);

    const upsertFiles: ModFile[] = (parsed.upsertFiles || []).map((f: any) => ({
      path: String(f.path || '').replace(/^\/+/, ''),
      content: String(f.content || ''),
      language: allowedLangs.has(f.language) ? f.language : inferLanguage(f.path),
      summary: f.summary ? String(f.summary) : undefined,
    }));

    const upsertTextures: ModTexture[] = (parsed.upsertTextures || []).map((t: any) => {
      const palette: Record<string, string> = {};
      for (const entry of t.paletteEntries || []) {
        if (entry?.symbol) {
          palette[String(entry.symbol)[0]] = String(entry.hex || '#94A3B8');
        }
      }
      return {
        path: String(t.path || '').replace(/^\/+/, ''),
        name: String(t.name || 'texture'),
        elementId: t.elementId ? String(t.elementId) : undefined,
        width: 16 as const,
        height: 16 as const,
        palette,
        rows: Array.isArray(t.rows) ? t.rows.map(String) : [],
      };
    });

    const upsertElements: ModElement[] = (parsed.upsertElements || []).map((e: any) => {
      let recipe: ModElement['recipe'] | undefined;
      if (e.recipe && e.recipe.result) {
        const keyMap: Record<string, string> = {};
        for (const ke of e.recipe.keyEntries || []) {
          if (ke?.symbol && ke?.item) {
            keyMap[String(ke.symbol)[0]] = String(ke.item);
          }
        }
        recipe = {
          type:
            e.recipe.type === 'shapeless' || e.recipe.type === 'smelting'
              ? e.recipe.type
              : 'shaped',
          pattern: Array.isArray(e.recipe.pattern) ? e.recipe.pattern.map(String) : undefined,
          key: Object.keys(keyMap).length > 0 ? keyMap : undefined,
          ingredients: Array.isArray(e.recipe.ingredients)
            ? e.recipe.ingredients.map(String)
            : undefined,
          result: String(e.recipe.result),
          count: typeof e.recipe.count === 'number' ? e.recipe.count : 1,
        };
      }
      return {
        id: String(e.id || e.identifier || `el_${Math.random().toString(36).slice(2, 8)}`),
        name: String(e.name || 'Unnamed Element'),
        type: allowedElementTypes.has(e.type) ? e.type : 'item',
        description: String(e.description || ''),
        identifier: String(e.identifier || `${plan.modId}:item`),
        texturePath: e.texturePath ? String(e.texturePath).replace(/^\/+/, '') : undefined,
        modelPath: e.modelPath ? String(e.modelPath).replace(/^\/+/, '') : undefined,
        filePaths: Array.isArray(e.filePaths)
          ? e.filePaths.map((p: string) => String(p).replace(/^\/+/, ''))
          : [],
        stats: Array.isArray(e.stats)
          ? e.stats.map((s: any) => ({
              label: String(s.label || ''),
              value: String(s.value || ''),
            }))
          : [],
        recipe,
      };
    });

    return {
      assistantResponse:
        parsed.assistantResponse || 'Generated the requested Minecraft mod components.',
      name: parsed.name || plan.modName,
      modId: parsed.modId || plan.modId,
      description: parsed.description || plan.description,
      upsertFiles,
      deleteFiles: Array.isArray(parsed.deleteFiles)
        ? parsed.deleteFiles.map((p: string) => String(p).replace(/^\/+/, ''))
        : [],
      upsertTextures,
      upsertElements,
    };
  });
}

export interface ModRepairResult {
  repairSummary: string;
  upsertFiles: ModFile[];
  upsertTextures: ModTexture[];
}

export async function repairModWithGemini(
  project: ModProject,
  issues: ValidationIssue[]
): Promise<ModRepairResult> {
  const ai = getClient();
  const loaderSpec = getLoaderSpecification(project.loader, project.mcVersion);

  const affectedPaths = new Set(issues.map((i) => i.filePath));
  const relevantFiles = project.files.filter(
    (f) =>
      affectedPaths.has(f.path) ||
      f.path.endsWith('manifest.json') ||
      f.path.endsWith('fabric.mod.json')
  );

  const systemInstruction = `You are a Minecraft Mod Compiler & Schema Repair Engineer.
Inspect the validation errors and affected files below, fix all syntax, JSON schema, UUID, package/class name, recipe key, and missing manifest/texture issues, and return ONLY the corrected files/textures.
${loaderSpec}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: JSON.stringify(
        {
          modId: project.modId,
          loader: project.loader,
          mcVersion: project.mcVersion,
          issues,
          relevantFiles,
          existingTextures: project.textures.filter((t) => affectedPaths.has(t.path)),
        },
        null,
        2
      ),
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            repairSummary: { type: Type.STRING },
            upsertFiles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  content: { type: Type.STRING },
                  language: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['path', 'content', 'language'],
              },
            },
            upsertTextures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  name: { type: Type.STRING },
                  paletteEntries: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        symbol: { type: Type.STRING },
                        hex: { type: Type.STRING },
                      },
                      required: ['symbol', 'hex'],
                    },
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['path', 'name', 'paletteEntries', 'rows'],
              },
            },
          },
          required: ['repairSummary', 'upsertFiles', 'upsertTextures'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const upsertFiles: ModFile[] = (parsed.upsertFiles || []).map((f: any) => ({
      path: String(f.path || '').replace(/^\/+/, ''),
      content: String(f.content || ''),
      language: inferLanguage(f.path),
      summary: f.summary ? String(f.summary) : 'Auto-repaired by Gemini validator',
    }));

    const upsertTextures: ModTexture[] = (parsed.upsertTextures || []).map((t: any) => {
      const palette: Record<string, string> = {};
      for (const entry of t.paletteEntries || []) {
        if (entry?.symbol) {
          palette[String(entry.symbol)[0]] = String(entry.hex || '#94A3B8');
        }
      }
      return {
        path: String(t.path || '').replace(/^\/+/, ''),
        name: String(t.name || 'texture'),
        width: 16 as const,
        height: 16 as const,
        palette,
        rows: Array.isArray(t.rows) ? t.rows.map(String) : [],
      };
    });

    return {
      repairSummary: parsed.repairSummary || 'Applied automated fixes.',
      upsertFiles,
      upsertTextures,
    };
  });
}

function inferLanguage(path: string): FileLanguage {
  const p = String(path || '').toLowerCase();
  if (p.endsWith('.java')) return 'java';
  if (p.endsWith('.json') || p.endsWith('.mcmeta')) return 'json';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'javascript';
  if (p.endsWith('.ts')) return 'typescript';
  if (p.endsWith('.toml')) return 'toml';
  if (p.endsWith('.gradle')) return 'gradle';
  if (p.endsWith('.properties')) return 'properties';
  if (p.endsWith('.lang')) return 'lang';
  if (p.endsWith('.mcfunction')) return 'mcfunction';
  return 'text';
}
