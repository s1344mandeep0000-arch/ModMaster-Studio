import React, { useEffect, useRef } from 'react';
import type { ModTexture } from '../types/mod';
import { drawTextureToCanvas, renderTextureToDataUrl } from '../utils/modExport';

interface TextureCanvasProps {
  texture: ModTexture;
  size?: number;
  className?: string;
  interactive?: boolean;
  activeColor?: string;
  onPaintPixel?: (x: number, y: number) => void;
}

export const TextureCanvas: React.FC<TextureCanvasProps> = ({
  texture,
  size = 64,
  className = '',
  interactive = false,
  onPaintPixel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawTextureToCanvas(canvasRef.current, texture, Math.max(1, Math.floor(size / 16)));
  }, [texture, size]);

  const handlePointer = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPaintPixel || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 16);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 16);
    if (x >= 0 && x < 16 && y >= 0 && y < 16) {
      onPaintPixel(x, y);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-md border border-slate-700/70 bg-[#0d1320] overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage:
          'linear-gradient(45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.08) 75%)',
        backgroundSize: '12px 12px',
        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={handlePointer}
        onMouseMove={(e) => {
          if (e.buttons === 1) handlePointer(e);
        }}
        className={`w-full h-full pixelated ${interactive ? 'cursor-crosshair' : ''}`}
      />
    </div>
  );
};

export const IsometricBlockPreview: React.FC<{ texture: ModTexture }> = ({ texture }) => {
  const dataUrl = renderTextureToDataUrl(texture, 6);

  return (
    <div className="flex items-center justify-center w-24 h-24 shrink-0">
      <div
        className="relative w-12 h-12"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateX(-28deg) rotateY(42deg)',
        }}
      >
        <div
          className="absolute inset-0 pixelated border border-white/10"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundSize: 'cover',
            transform: 'translateZ(24px)',
          }}
        />
        <div
          className="absolute inset-0 pixelated border border-white/10 brightness-90"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundSize: 'cover',
            transform: 'rotateY(90deg) translateZ(24px)',
          }}
        />
        <div
          className="absolute inset-0 pixelated border border-white/10 brightness-110"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundSize: 'cover',
            transform: 'rotateX(90deg) translateZ(24px)',
          }}
        />
      </div>
    </div>
  );
};
