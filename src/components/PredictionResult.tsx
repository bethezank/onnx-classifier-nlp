interface Prediction {
  className: string;
  probability: number;
}

interface PredictionResultProps {
  predictions: Prediction[];
  forceShowEmpty?: boolean;
}

export const PredictionResult = ({ predictions, forceShowEmpty = false }: PredictionResultProps) => {
  if (predictions.length === 0 && !forceShowEmpty) return null;

  const visiblePredictions = predictions;
  const barColors = ["bg-primary", "bg-blue-400", "bg-purple-400", "bg-slate-400", "bg-slate-500"];

  return (
    <div className="flex h-full flex-col space-y-4 rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          ANALYSIS RESULTS
        </span>
      </div>

      {visiblePredictions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-900/40 px-4 py-6 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
          No data found
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {visiblePredictions.map((pred, index) => {
            const percent = (pred.probability * 100).toFixed(1);
            const displayClassName = pred.className.replace(/_/g, " ");

            return (
              <div key={`${pred.className}-${index}`} className="min-w-0 space-y-1.5">
                <div className="flex justify-between gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span className="truncate" title={displayClassName}>{displayClassName}</span>
                  <span>{percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full ${barColors[index] || "bg-slate-400"} rounded-full`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
