import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  classifyGeminiError,
  generateModFilesWithGemini,
  isApiKeyConfigured,
  planModWithGemini,
  repairModWithGemini,
} from './server/geminiModEngine.ts';
import { mergeProjectPatch, validateModProject } from './server/modValidator.ts';
import type { ModProject, ValidationIssue } from './src/types/mod.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function sendSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
    ]);
    if (origin && (allowedOrigins.has(origin) || origin === process.env.APP_URL)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    const configured = isApiKeyConfigured();
    res.json({
      ok: configured,
      configured,
      model: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/mod/chat', async (req, res) => {
    const { prompt, project } = req.body as {
      prompt?: string;
      project?: ModProject;
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({
        error: 'Prompt must be a non-empty string.',
        code: 'INVALID_PROMPT',
        retryable: false,
      });
      return;
    }

    if (!project || typeof project !== 'object') {
      res.status(400).json({
        error: 'Project payload is required.',
        code: 'INVALID_PROJECT',
        retryable: false,
      });
      return;
    }

    if (!isApiKeyConfigured()) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to use AI mod generation.',
        code: 'API_KEY_MISSING',
        retryable: false,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    try {
      sendSse(res, 'progress', {
        stage: 'planning',
        label: `Planning ${project.loader.toUpperCase()} architecture for Minecraft ${project.mcVersion}...`,
      });

      const plan = await planModWithGemini(prompt.trim(), project);
      if (closed) return;

      sendSse(res, 'plan', {
        modName: plan.modName,
        modId: plan.modId,
        description: plan.description,
        planSteps: plan.planSteps,
      });

      sendSse(res, 'progress', {
        stage: 'generating',
        label: 'Generating source files, models, recipes, structures, and 16×16 textures...',
      });

      const generated = await generateModFilesWithGemini(prompt.trim(), project, plan);
      if (closed) return;

      sendSse(res, 'progress', {
        stage: 'validating',
        label: `Validating ${generated.upsertFiles.length} generated files and ${generated.upsertTextures.length} textures...`,
      });

      let merged = mergeProjectPatch(project, {
        name: generated.name,
        modId: generated.modId,
        description: generated.description,
        upsertFiles: generated.upsertFiles,
        deleteFiles: generated.deleteFiles,
        upsertTextures: generated.upsertTextures,
        upsertElements: generated.upsertElements,
      });

      let issues = validateModProject(merged);
      const initialErrors = issues.filter((i) => i.severity === 'error');
      let fixedCount = 0;
      let repairNotes = '';
      let finalUpsertFiles = [...generated.upsertFiles];
      let finalUpsertTextures = [...generated.upsertTextures];

      if (initialErrors.length > 0) {
        sendSse(res, 'progress', {
          stage: 'fixing',
          label: `Detected ${initialErrors.length} error${initialErrors.length === 1 ? '' : 's'} — running Gemini auto-repair...`,
        });

        const repair = await repairModWithGemini(merged, initialErrors);
        if (closed) return;

        repairNotes = repair.repairSummary;
        merged = mergeProjectPatch(merged, {
          upsertFiles: repair.upsertFiles,
          upsertTextures: repair.upsertTextures,
        });

        const filePatchMap = new Map(finalUpsertFiles.map((f) => [f.path, f]));
        for (const rf of repair.upsertFiles) {
          filePatchMap.set(rf.path, rf);
        }
        finalUpsertFiles = Array.from(filePatchMap.values());

        const texPatchMap = new Map(finalUpsertTextures.map((t) => [t.path, t]));
        for (const rt of repair.upsertTextures) {
          texPatchMap.set(rt.path, rt);
        }
        finalUpsertTextures = Array.from(texPatchMap.values());

        const postIssues = validateModProject(merged);
        const remainingErrorKeys = new Set(
          postIssues.filter((i) => i.severity === 'error').map((i) => `${i.filePath}:${i.rule}`)
        );
        fixedCount = initialErrors.filter(
          (i) => !remainingErrorKeys.has(`${i.filePath}:${i.rule}`)
        ).length;
        issues = postIssues;
      }

      const assistantResponse = repairNotes
        ? `${generated.assistantResponse}\n\n**Automated Validation & Repair:** ${repairNotes}`
        : generated.assistantResponse;

      sendSse(res, 'complete', {
        assistantResponse,
        plan: plan.planSteps,
        projectPatch: {
          name: merged.name,
          modId: merged.modId,
          namespace: merged.namespace,
          description: merged.description,
          upsertFiles: finalUpsertFiles,
          deleteFiles: generated.deleteFiles,
          upsertTextures: finalUpsertTextures,
          upsertElements: generated.upsertElements,
        },
        validationIssues: issues,
        appliedSummary: {
          filesUpserted: finalUpsertFiles.length,
          filesDeleted: generated.deleteFiles.length,
          texturesGenerated: finalUpsertTextures.length,
          elementsUpdated: generated.upsertElements.length,
          issuesFound: initialErrors.length,
          issuesFixed: fixedCount,
        },
      });
      res.end();
    } catch (err) {
      const classified = classifyGeminiError(err);
      if (!closed) {
        sendSse(res, 'error', {
          error: classified.message,
          code: classified.code,
          status: classified.status,
          retryable: classified.retryable,
        });
        res.end();
      }
    }
  });

  app.post('/api/mod/validate', async (req, res) => {
    const { project, autoFix } = req.body as {
      project?: ModProject;
      autoFix?: boolean;
    };

    if (!project || typeof project !== 'object') {
      res.status(400).json({ error: 'Project payload is required.' });
      return;
    }

    const initialIssues = validateModProject(project);

    if (!autoFix || initialIssues.length === 0) {
      res.json({
        issues: initialIssues,
        repaired: false,
      });
      return;
    }

    if (!isApiKeyConfigured()) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Static validation ran, but AI auto-repair requires GEMINI_API_KEY.',
        code: 'API_KEY_MISSING',
        issues: initialIssues,
      });
      return;
    }

    try {
      const repair = await repairModWithGemini(project, initialIssues);
      const merged = mergeProjectPatch(project, {
        upsertFiles: repair.upsertFiles,
        upsertTextures: repair.upsertTextures,
      });
      const postIssues: ValidationIssue[] = validateModProject(merged);
      const remainingKeys = new Set(postIssues.map((i) => `${i.filePath}:${i.rule}`));
      const fixedCount = initialIssues.filter(
        (i) => !remainingKeys.has(`${i.filePath}:${i.rule}`)
      ).length;

      res.json({
        repaired: true,
        repairSummary: repair.repairSummary,
        fixedCount,
        upsertFiles: repair.upsertFiles,
        upsertTextures: repair.upsertTextures,
        issues: postIssues,
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
        retryable: classified.retryable,
        issues: initialIssues,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Minecraft AI Mod Maker Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
