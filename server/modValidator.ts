import type {
  ModElement,
  ModFile,
  ModProject,
  ModTexture,
  ValidationIssue,
} from '../src/types/mod.ts';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR_REGEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

function makeIssue(
  id: string,
  filePath: string,
  severity: 'error' | 'warning',
  rule: string,
  message: string
): ValidationIssue {
  return { id, filePath, severity, rule, message };
}

function checkBalancedBraces(content: string): { balanced: boolean; detail?: string } {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth < 0) {
        return { balanced: false, detail: 'Unexpected closing brace `}`' };
      }
    }
  }

  if (depth !== 0) {
    return { balanced: false, detail: `Unclosed brace depth (${depth} remaining)` };
  }
  return { balanced: true };
}

export function normalizeTexture(tex: ModTexture): ModTexture {
  const cleanPalette: Record<string, string> = {};
  for (const [key, val] of Object.entries(tex.palette || {})) {
    if (!key) continue;
    const ch = key[0];
    if (val === 'transparent' || val === 'none' || val === '') {
      cleanPalette[ch] = 'transparent';
    } else if (HEX_COLOR_REGEX.test(val)) {
      cleanPalette[ch] = val;
    } else {
      cleanPalette[ch] = '#94A3B8';
    }
  }
  if (!cleanPalette['.']) {
    cleanPalette['.'] = 'transparent';
  }

  const normalizedRows: string[] = [];
  for (let r = 0; r < 16; r++) {
    const rawRow = (tex.rows && tex.rows[r]) || '';
    const padded = rawRow.slice(0, 16).padEnd(16, '.');
    normalizedRows.push(padded);
  }

  return {
    ...tex,
    width: 16,
    height: 16,
    palette: cleanPalette,
    rows: normalizedRows,
  };
}

export function mergeProjectPatch(
  project: ModProject,
  patch: {
    name?: string;
    modId?: string;
    description?: string;
    upsertFiles?: ModFile[];
    deleteFiles?: string[];
    upsertTextures?: ModTexture[];
    upsertElements?: ModElement[];
  }
): ModProject {
  const fileMap = new Map<string, ModFile>();
  for (const f of project.files) {
    fileMap.set(f.path, f);
  }
  for (const delPath of patch.deleteFiles || []) {
    fileMap.delete(delPath);
  }
  for (const f of patch.upsertFiles || []) {
    if (f.path && typeof f.content === 'string') {
      fileMap.set(f.path, f);
    }
  }

  const textureMap = new Map<string, ModTexture>();
  for (const t of project.textures) {
    textureMap.set(t.path, normalizeTexture(t));
  }
  for (const t of patch.upsertTextures || []) {
    if (t.path) {
      textureMap.set(t.path, normalizeTexture(t));
    }
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

  const cleanModId = (patch.modId || project.modId || 'custom_mod')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+/, '') || 'custom_mod';

  return {
    ...project,
    name: patch.name || project.name,
    modId: cleanModId,
    namespace: cleanModId,
    description: patch.description || project.description,
    files: Array.from(fileMap.values()).sort((a, b) => a.path.localeCompare(b.path)),
    textures: Array.from(textureMap.values()).sort((a, b) => a.path.localeCompare(b.path)),
    elements: Array.from(elementMap.values()),
    updatedAt: new Date().toISOString(),
  };
}

export function validateModProject(project: ModProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let idx = 0;
  const nextId = () => `val_${++idx}`;

  const filePaths = new Set(project.files.map((f) => f.path));
  const texturePaths = new Set(project.textures.map((t) => t.path));

  if (project.files.length === 0) {
    issues.push(
      makeIssue(
        nextId(),
        'project',
        'error',
        'empty-project',
        'Project has no generated files yet.'
      )
    );
    return issues;
  }

  if (project.loader === 'fabric') {
    const fabricManifest = project.files.find((f) =>
      f.path.endsWith('fabric.mod.json')
    );
    if (!fabricManifest) {
      issues.push(
        makeIssue(
          nextId(),
          'src/main/resources/fabric.mod.json',
          'error',
          'missing-fabric-manifest',
          'Fabric mods require src/main/resources/fabric.mod.json.'
        )
      );
    } else {
      try {
        const parsed = JSON.parse(fabricManifest.content);
        if (!parsed.id || !/^[a-z][a-z0-9-_]{1,63}$/.test(parsed.id)) {
          issues.push(
            makeIssue(
              nextId(),
              fabricManifest.path,
              'error',
              'invalid-mod-id',
              'fabric.mod.json "id" must be lowercase alphanumeric/underscores.'
            )
          );
        }
        if (!parsed.entrypoints?.main?.length) {
          issues.push(
            makeIssue(
              nextId(),
              fabricManifest.path,
              'warning',
              'missing-entrypoint',
              'fabric.mod.json is missing entrypoints.main.'
            )
          );
        }
      } catch {
        // Caught in generic JSON pass below
      }
    }
  } else if (project.loader === 'neoforge') {
    const hasToml = project.files.some((f) =>
      f.path.endsWith('META-INF/neoforge.mods.toml')
    );
    if (!hasToml) {
      issues.push(
        makeIssue(
          nextId(),
          'src/main/resources/META-INF/neoforge.mods.toml',
          'error',
          'missing-neoforge-manifest',
          'NeoForge mods require src/main/resources/META-INF/neoforge.mods.toml.'
        )
      );
    }
  } else if (project.loader === 'forge') {
    const hasToml = project.files.some((f) => f.path.endsWith('META-INF/mods.toml'));
    if (!hasToml) {
      issues.push(
        makeIssue(
          nextId(),
          'src/main/resources/META-INF/mods.toml',
          'error',
          'missing-forge-manifest',
          'Forge mods require src/main/resources/META-INF/mods.toml.'
        )
      );
    }
  } else if (project.loader === 'bedrock') {
    const bpManifest = project.files.find(
      (f) => f.path === 'behavior_pack/manifest.json'
    );
    const rpManifest = project.files.find(
      (f) => f.path === 'resource_pack/manifest.json'
    );
    if (!bpManifest) {
      issues.push(
        makeIssue(
          nextId(),
          'behavior_pack/manifest.json',
          'error',
          'missing-bp-manifest',
          'Bedrock add-ons require behavior_pack/manifest.json.'
        )
      );
    }
    if (!rpManifest) {
      issues.push(
        makeIssue(
          nextId(),
          'resource_pack/manifest.json',
          'error',
          'missing-rp-manifest',
          'Bedrock add-ons require resource_pack/manifest.json.'
        )
      );
    }
    for (const manifest of [bpManifest, rpManifest]) {
      if (!manifest) continue;
      try {
        const parsed = JSON.parse(manifest.content);
        if (!parsed.header?.uuid || !UUID_REGEX.test(parsed.header.uuid)) {
          issues.push(
            makeIssue(
              nextId(),
              manifest.path,
              'error',
              'invalid-uuid',
              `${manifest.path} header.uuid must be a valid v4 UUID.`
            )
          );
        }
        if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
          issues.push(
            makeIssue(
              nextId(),
              manifest.path,
              'error',
              'missing-modules',
              `${manifest.path} must declare at least one module.`
            )
          );
        } else {
          for (const mod of parsed.modules) {
            if (!mod.uuid || !UUID_REGEX.test(mod.uuid)) {
              issues.push(
                makeIssue(
                  nextId(),
                  manifest.path,
                  'error',
                  'invalid-module-uuid',
                  `${manifest.path} module UUID "${mod.uuid || ''}" is invalid.`
                )
              );
            }
          }
        }
      } catch {
        // Caught in JSON pass
      }
    }
  }

  for (const file of project.files) {
    if (!file.content.trim()) {
      issues.push(
        makeIssue(
          nextId(),
          file.path,
          'warning',
          'empty-file',
          'File content is empty.'
        )
      );
      continue;
    }

    if (
      file.path.endsWith('.json') ||
      file.path.endsWith('.mcmeta') ||
      file.path.endsWith('.geo.json')
    ) {
      try {
        const parsed = JSON.parse(file.content);

        if (
          file.path.includes('/recipe/') ||
          file.path.includes('/recipes/')
        ) {
          if (
            parsed.type === 'minecraft:crafting_shaped' &&
            Array.isArray(parsed.pattern)
          ) {
            const keyChars = new Set(Object.keys(parsed.key || {}));
            for (const row of parsed.pattern) {
              for (const ch of String(row)) {
                if (ch !== ' ' && !keyChars.has(ch)) {
                  issues.push(
                    makeIssue(
                      nextId(),
                      file.path,
                      'error',
                      'recipe-missing-key',
                      `Shaped recipe pattern uses symbol '${ch}' missing from "key".`
                    )
                  );
                }
              }
            }
          }
        }

        if (
          project.loader === 'bedrock' &&
          (file.path.includes('behavior_pack/items/') ||
            file.path.includes('behavior_pack/blocks/') ||
            file.path.includes('behavior_pack/entities/')) &&
          !parsed.format_version
        ) {
          issues.push(
            makeIssue(
              nextId(),
              file.path,
              'error',
              'bedrock-format-version',
              'Bedrock definition JSON must declare "format_version".'
            )
          );
        }
      } catch (err) {
        issues.push(
          makeIssue(
            nextId(),
            file.path,
            'error',
            'invalid-json',
            `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`
          )
        );
      }
    }

    if (file.path.endsWith('.java')) {
      const braceCheck = checkBalancedBraces(file.content);
      if (!braceCheck.balanced) {
        issues.push(
          makeIssue(
            nextId(),
            file.path,
            'error',
            'java-unbalanced-braces',
            braceCheck.detail || 'Unbalanced braces in Java file.'
          )
        );
      }
      if (!/\bpackage\s+[a-z0-9_.]+;/.test(file.content)) {
        issues.push(
          makeIssue(
            nextId(),
            file.path,
            'error',
            'java-missing-package',
            'Java source file is missing a package declaration.'
          )
        );
      }
      const fileName = file.path.split('/').pop()?.replace('.java', '') || '';
      const classMatch = file.content.match(
        /\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+([A-Za-z0-9_]+)/
      );
      if (classMatch && classMatch[1] !== fileName) {
        issues.push(
          makeIssue(
            nextId(),
            file.path,
            'error',
            'java-classname-mismatch',
            `Public type "${classMatch[1]}" does not match filename "${fileName}.java".`
          )
        );
      }
    }

    if (file.path.endsWith('.js') || file.path.endsWith('.ts')) {
      const braceCheck = checkBalancedBraces(file.content);
      if (!braceCheck.balanced) {
        issues.push(
          makeIssue(
            nextId(),
            file.path,
            'error',
            'script-unbalanced-braces',
            braceCheck.detail || 'Unbalanced braces in script file.'
          )
        );
      }
    }
  }

  for (const tex of project.textures) {
    if (!tex.rows || tex.rows.length !== 16) {
      issues.push(
        makeIssue(
          nextId(),
          tex.path,
          'warning',
          'texture-dimensions',
          'Texture must contain 16 rows for 16×16 pixel art.'
        )
      );
    }
    for (const r of tex.rows || []) {
      for (const ch of r) {
        if (ch !== '.' && !tex.palette?.[ch]) {
          issues.push(
            makeIssue(
              nextId(),
              tex.path,
              'warning',
              'texture-palette-key',
              `Texture row references undefined palette key '${ch}'.`
            )
          );
          break;
        }
      }
    }
  }

  for (const el of project.elements) {
    if (el.texturePath && !texturePaths.has(el.texturePath)) {
      issues.push(
        makeIssue(
          nextId(),
          el.texturePath,
          'warning',
          'missing-element-texture',
          `Element "${el.name}" references texture "${el.texturePath}" which is not generated yet.`
        )
      );
    }
    if (el.modelPath && !filePaths.has(el.modelPath)) {
      issues.push(
        makeIssue(
          nextId(),
          el.modelPath,
          'warning',
          'missing-element-model',
          `Element "${el.name}" references model "${el.modelPath}" which is missing.`
        )
      );
    }
  }

  return issues;
}
