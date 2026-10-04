import { useEffect, useRef, useState, type RefObject } from "react";
import { Eye, Image as ImageIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import type { OcclusionHeatmap } from "@/utils/onnxInference";
import { appConfig } from "@/config";

interface OcclusionExplanationProps {
  heatmap: OcclusionHeatmap;
  imageRef: RefObject<HTMLImageElement>;
  previewCardRef: RefObject<HTMLDivElement>;
  onImageReady?: (imageDataUrl: string) => void;
  onSummarize?: () => void;
  isSummarizing?: boolean;
}

export const OcclusionExplanation = ({
  heatmap,
  imageRef,
  previewCardRef,
  onImageReady,
  onSummarize,
  isSummarizing = false,
}: OcclusionExplanationProps) => {
  const [showExplanation, setShowExplanation] = useState(true);
  const [opacity, setOpacity] = useState(appConfig.visualization.defaultOpacity);
  const [overlayBounds, setOverlayBounds] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const image = imageRef.current;
    if (!image) return;

    const updateOverlayBounds = () => {
      const previewCard = previewCardRef.current;
      if (!previewCard) return;
      const imageRect = image.getBoundingClientRect();
      const cardRect = previewCard.getBoundingClientRect();
      setOverlayBounds({
        top: imageRect.top - cardRect.top,
        left: imageRect.left - cardRect.left,
        width: imageRect.width,
        height: imageRect.height,
      });
    };

    const drawOverlay = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      updateOverlayBounds();

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (!showExplanation) {
        onImageReady?.(canvas.toDataURL("image/jpeg", appConfig.visualization.imageQuality));
        return;
      }

      const maxValue = Math.max(...heatmap.values, 0);
      if (maxValue <= 0) return;

      const overlay = document.createElement("canvas");
      overlay.width = heatmap.columns;
      overlay.height = heatmap.rows;
      const overlayContext = overlay.getContext("2d");
      if (!overlayContext) return;

      heatmap.values.forEach((value, index) => {
        const row = Math.floor(index / heatmap.columns);
        const column = index % heatmap.columns;
        const normalized = value / maxValue;
        const hue = appConfig.visualization.hueEnd
          + (1 - normalized) * (appConfig.visualization.hueStart - appConfig.visualization.hueEnd);
        const alpha = (appConfig.visualization.baseAlpha + normalized * appConfig.visualization.alphaRange) * opacity;
        overlayContext.fillStyle = `hsla(${hue}, ${appConfig.visualization.saturation}%, ${appConfig.visualization.lightness}%, ${alpha})`;
        overlayContext.fillRect(column, row, 1, 1);
      });

      context.imageSmoothingEnabled = true;
      context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      onImageReady?.(canvas.toDataURL("image/jpeg", appConfig.visualization.imageQuality));
    };

    image.addEventListener("load", drawOverlay);
    window.addEventListener("resize", updateOverlayBounds);
    drawOverlay();
    return () => {
      image.removeEventListener("load", drawOverlay);
      window.removeEventListener("resize", updateOverlayBounds);
    };
  }, [heatmap, imageRef, onImageReady, opacity, previewCardRef, showExplanation]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Prediction explanation heatmap"
        className="pointer-events-none absolute z-10 block rounded-xl"
        style={{
          top: overlayBounds.top,
          left: overlayBounds.left,
          width: overlayBounds.width,
          height: overlayBounds.height,
        }}
      />
      <section className="relative h-full overflow-hidden rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">PREDICTION EXPLANATION</p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Occlusion Sensitivity</p>
            </div>
            <span className="shrink-0 rounded-full border border-indigo-100 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-primary dark:border-indigo-400/20 dark:bg-slate-800">
              {heatmap.rows} × {heatmap.columns} MAP
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                aria-pressed={!showExplanation}
                onClick={() => setShowExplanation(false)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${!showExplanation ? "bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"}`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Original
              </button>
              <button
                type="button"
                aria-pressed={showExplanation}
                onClick={() => setShowExplanation(true)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${showExplanation ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"}`}
              >
                <Eye className="h-3.5 w-3.5" />
                Heatmap
              </button>
            </div>
            {onSummarize && (
              <button
                type="button"
                onClick={onSummarize}
                disabled={isSummarizing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-primary/20 transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isSummarizing ? "Summarizing..." : "Ask AI"}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Overlay strength</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={appConfig.visualization.minOpacity}
              max={appConfig.visualization.maxOpacity}
              step={appConfig.visualization.opacityStep}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              disabled={!showExplanation}
              className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
              aria-label="Explanation overlay opacity"
            />
            <div className="mt-3 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <span>Low</span>
              <span className="mx-3 h-2 flex-1 rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#22d3ee_33%,#facc15_66%,#ef4444_100%)]" aria-hidden="true" />
              <span>High</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
