// digitalTwinRenderer.ts
// Mock Digital Twin renderer used to simulate SeedCore emissions -> precision mockup snapshot.
// Safe: timeouts, fallbacks, and defensive sizing.

import type { WearableDesignDraft } from './wearableStudioTypes';

export type RenderEmissionParams = {
  artwork_uri?: string;
  placement_anchor?: string;
  scale?: number;
  warp_profile?: string;
};

export function svgFallbackDataUrl(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#e2e8f0"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export class MockRenderService {
  private disposed = false;

  dispose() {
    this.disposed = true;
  }

  async processEmission(
    subtaskType: string,
    params: RenderEmissionParams,
    design: WearableDesignDraft
  ): Promise<string> {
    if (this.disposed) throw new Error('RenderService disposed');
    if (subtaskType !== 'generate_precision_mockups') {
      throw new Error(`Unknown subtask type: ${subtaskType}`);
    }
    return this.renderDigitalTwin(params, design);
  }

  private loadImage(url: string, timeoutMs = 20000): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const t = window.setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        reject(new Error(`Image load timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      img.onload = () => {
        window.clearTimeout(t);
        resolve(img);
      };
      img.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('Image failed to load'));
      };

      img.src = url;
    });
  }

  private async renderDigitalTwin(params: RenderEmissionParams, design: WearableDesignDraft): Promise<string> {
    const mockupUrl = design.mockupImageUrl || design.imageUrl || '';
    const printUrl = design.printImageUrl || design.imageUrl || '';

    let mockupImg: HTMLImageElement;
    try {
      mockupImg = await this.loadImage(mockupUrl);
    } catch {
      mockupImg = await this.loadImage(svgFallbackDataUrl(800, 1000), 5000);
    }

    let printImg: HTMLImageElement | null = null;
    try {
      printImg = printUrl ? await this.loadImage(printUrl) : null;
    } catch {
      printImg = null;
    }

    const mw = Math.max((mockupImg as any).naturalWidth || mockupImg.width || 0, 800);
    const mh = Math.max((mockupImg as any).naturalHeight || mockupImg.height || 0, 1000);

    const canvas = document.createElement('canvas');
    canvas.width = mw;
    canvas.height = mh;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to acquire 2D context');

    // 1) Base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mockupImg, 0, 0, canvas.width, canvas.height);

    // 2) Overlay print
    if (printImg) {
      const pw = Math.max((printImg as any).naturalWidth || printImg.width || 0, 0);
      const ph = Math.max((printImg as any).naturalHeight || printImg.height || 0, 0);

      const scale = typeof params.scale === 'number' && params.scale > 0 ? params.scale : 0.45;
      const scaledW = pw * scale;
      const scaledH = ph * scale;

      const anchor = params.placement_anchor || 'center_chest';

      let x = canvas.width / 2 - scaledW / 2;
      let y = canvas.height / 2 - scaledH / 2;

      if (anchor === 'center_chest' || anchor.includes('front')) {
        // Position lower on the chest - moved from 0.35 to 0.42 for more centered, lower placement
        y = canvas.height * 0.42 - scaledH / 2;
      } else if (anchor === 'center_back' || anchor.includes('back')) {
        y = canvas.height * 0.5 - scaledH / 2;
      }

      x = Math.max(0, Math.min(canvas.width - scaledW, x));
      y = Math.max(0, Math.min(canvas.height - scaledH, y));

      // Background removal on print image
      const tmp = document.createElement('canvas');
      tmp.width = pw;
      tmp.height = ph;

      const tctx = tmp.getContext('2d', { willReadFrequently: true, alpha: true });
      if (tctx) {
        tctx.drawImage(printImg, 0, 0);

        const imageData = tctx.getImageData(0, 0, tmp.width, tmp.height);
        const d = imageData.data;

        const whiteThreshold = 235;
        const veryWhiteThreshold = 250;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const a = d[i + 3];

          if (a === 0) continue;

          const avg = (r + g + b) / 3;
          const isWhite = r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;

          if (isWhite) {
            if (avg > veryWhiteThreshold) {
              d[i + 3] = 0;
            } else {
              const whiteness = (avg - whiteThreshold) / (veryWhiteThreshold - whiteThreshold);
              d[i + 3] = Math.max(0, Math.floor(a * (1 - whiteness * 0.95)));
            }
          }
        }

        tctx.putImageData(imageData, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.drawImage(tmp, x, y, scaledW, scaledH);
        ctx.restore();
      }
    }

    // 3) Metadata overlay
    const warp = params.warp_profile || 'standard';
    const anchorLabel = params.placement_anchor || 'center_chest';
    const scaleLabel = typeof params.scale === 'number' ? params.scale : 0.45;

    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Anchor: ${anchorLabel}`, 12, 28);
    ctx.fillText(`Scale: ${scaleLabel}`, 12, 46);
    ctx.fillText(`Warp: ${warp}`, 12, 64);
    ctx.restore();

    return canvas.toDataURL('image/png');
  }
}
