import JSZip from 'jszip';
import type { ModProject, ModTexture } from '../types/mod';

export function drawTextureToCanvas(
  canvas: HTMLCanvasElement,
  texture: ModTexture,
  pixelSize = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = 16 * pixelSize;
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const rows = texture.rows || [];
  const palette = texture.palette || {};

  for (let y = 0; y < 16; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x] || '.';
      const color = palette[ch];
      if (!color || color === 'transparent' || color === 'none') {
        continue;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
}

export function renderTextureToDataUrl(texture: ModTexture, pixelSize = 8): string {
  const canvas = document.createElement('canvas');
  drawTextureToCanvas(canvas, texture, pixelSize);
  return canvas.toDataURL('image/png');
}

export async function renderTextureToPngBytes(texture: ModTexture): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  drawTextureToCanvas(canvas, texture, 1);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    throw new Error(`Failed to render PNG for texture ${texture.path}`);
  }
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function exportModAsArchive(
  project: ModProject
): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();

  for (const file of project.files) {
    const normalizedPath = file.path.replace(/^\/+/, '');
    if (normalizedPath) {
      zip.file(normalizedPath, file.content);
    }
  }

  for (const texture of project.textures) {
    const normalizedPath = texture.path.replace(/^\/+/, '');
    if (normalizedPath) {
      const pngBytes = await renderTextureToPngBytes(texture);
      zip.file(normalizedPath, pngBytes);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeId = (project.modId || 'minecraft_mod').replace(/[^a-z0-9_-]/gi, '_');
  const ext = project.loader === 'bedrock' ? 'mcaddon' : 'zip';

  return {
    blob,
    filename: `${safeId}-${project.loader}-${project.mcVersion}.${ext}`,
  };
}
