import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUploadCard } from "./FileUploadCard";
import { Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createOcclusionHeatmap, loadONNXModel, loadClassLabels, runInferenceWithImageSizeFallback } from "@/utils/onnxInference";
import type { OcclusionHeatmap } from "@/utils/onnxInference";
import type { InferenceSession } from "onnxruntime-web";
import { PredictionResult } from "./PredictionResult";
import { OcclusionExplanation } from "./OcclusionExplanation";
import { analyzeExplanationWithOpenRouter } from "@/utils/openrouter";
import { appConfig } from "@/config";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface Prediction {
    className: string;
    probability: number;
}

export const CustomModelCard = () => {
    const { toast } = useToast();

    // Independent state for Custom Model section
    const [onnxFile, setOnnxFile] = useState<File | null>(null);
    const [classFile, setClassFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [session, setSession] = useState<InferenceSession | null>(null);
    const [classLabels, setClassLabels] = useState<string[]>([]);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSession, setHasSession] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [occlusionHeatmap, setOcclusionHeatmap] = useState<OcclusionHeatmap | null>(null);
    const [explanationProgress, setExplanationProgress] = useState<{ completed: number; total: number } | null>(null);
    const [explanationImageDataUrl, setExplanationImageDataUrl] = useState<string | null>(null);
    const [llmSummary, setLlmSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const occlusionAbortControllerRef = useRef<AbortController | null>(null);
    const selectedImageRef = useRef<HTMLImageElement | null>(null);
    const previewCardRef = useRef<HTMLDivElement | null>(null);
    const imageUrl = useMemo(
        () => imageFile ? URL.createObjectURL(imageFile) : null,
        [imageFile],
    );

    useEffect(() => {
        return () => {
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        };
    }, [imageUrl]);

    const handleExplanationImageReady = useCallback((imageDataUrl: string) => {
        setExplanationImageDataUrl(imageDataUrl);
    }, []);

    const cancelOcclusion = () => {
        occlusionAbortControllerRef.current?.abort();
        occlusionAbortControllerRef.current = null;
        setExplanationProgress(null);
    };

    const handleLoadModel = async () => {
        if (!onnxFile || !classFile) {
            toast({
                title: "Missing files",
                description: "Please upload both the ONNX model and JSON label file.",
                variant: "destructive"
            });
            return;
        }

        setIsLoading(true);
        setPredictions([]);
        setOcclusionHeatmap(null);
        setExplanationImageDataUrl(null);
        setLlmSummary(null);
        cancelOcclusion();

        try {
            const loadedSession = await loadONNXModel(onnxFile);
            const loadedLabels = await loadClassLabels(classFile);
            setSession(loadedSession);
            setClassLabels(loadedLabels);
            setHasSession(true);
            toast({
                title: "Model ready",
                description: "Your model is ready for prediction.",
            });
        } catch (e) {
            toast({
                title: "Model load failed",
                description: "Unable to initialize the ONNX session.",
                variant: "destructive"
            });
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePredict = async () => {
        if (!session || !classLabels.length) {
            toast({
                title: "Model not ready",
                description: "Please load a model first.",
                variant: "destructive"
            });
            return;
        }
        if (!imageFile) {
            toast({
                title: "Missing image",
                description: "Please upload an image to analyze.",
                variant: "destructive"
            });
            return;
        }

        setIsLoading(true);
        setOcclusionHeatmap(null);
        setExplanationImageDataUrl(null);
        setLlmSummary(null);
        cancelOcclusion();
        let predictionReady = false;
        try {
            const { predictions: results, imageSize } = await runInferenceWithImageSizeFallback(session, imageFile, classLabels);
            setPredictions(results);
            predictionReady = true;

            const targetClassIndex = classLabels.indexOf(results[0]?.className ?? "");
            if (targetClassIndex < 0) {
                throw new Error("Could not identify the predicted class for explanation.");
            }

            const abortController = new AbortController();
            occlusionAbortControllerRef.current = abortController;
            setExplanationProgress({ completed: 0, total: appConfig.occlusion.totalRegions });
            const explanation = await createOcclusionHeatmap(
                session,
                imageFile,
                imageSize,
                targetClassIndex,
                results[0]?.probability ?? 0,
                {
                    gridSize: appConfig.occlusion.gridSize,
                    signal: abortController.signal,
                    onProgress: setExplanationProgress,
                },
            );
            setOcclusionHeatmap(explanation);
            setExplanationProgress(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown inference error";
            if (message !== "Occlusion explanation cancelled.") {
                toast({
                    title: predictionReady ? "Explanation unavailable" : "Analysis failed",
                    description: predictionReady
                        ? "The prediction is available, but its visual explanation could not be created."
                        : message,
                    ...(predictionReady ? {} : { variant: "destructive" as const }),
                });
                console.error(error);
            }
        } finally {
            occlusionAbortControllerRef.current = null;
            setExplanationProgress(null);
            setIsLoading(false);
        }
    };

    const handleSummarizeExplanation = async () => {
        if (!explanationImageDataUrl || !onnxFile || !predictions[0]) return;

        setIsSummarizing(true);
        try {
            const result = await analyzeExplanationWithOpenRouter(explanationImageDataUrl, {
                modelName: onnxFile.name,
                predictedClass: predictions[0].className,
                score: predictions[0].probability,
                explanationMethod: "Occlusion Sensitivity",
                heatmapGrid: `${appConfig.occlusion.gridSize}x${appConfig.occlusion.gridSize}`,
            });
            setLlmSummary(result.summary);
        } catch (error) {
            toast({
                title: "AI summary failed",
                description: error instanceof Error ? error.message : "Unable to generate an AI summary.",
                variant: "destructive",
            });
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleSetOnnxFile = (file: File | null) => {
        setOnnxFile(file);
        setHasSession(false);
        setSession(null);
        setPredictions([]);
        setOcclusionHeatmap(null);
        setLlmSummary(null);
    };

    const handleSetClassFile = (file: File | null) => {
        setClassFile(file);
        setHasSession(false);
        setSession(null);
        setPredictions([]);
    };

    const handleSetImageFile = (file: File | null) => {
        setImageFile(file);
        setPredictions([]);
        setOcclusionHeatmap(null);
        setExplanationImageDataUrl(null);
        setLlmSummary(null);
        cancelOcclusion();
    };

    return (
        <section className="glass-card rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
            <div className="flex flex-col items-start gap-2 mb-6">
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    Use your own AI model instantly
                </h3>
                <p className="text-muted-foreground text-base">
                    Upload your own ONNX model and JSON class labels to analyze other kinds of images with the same workflow.
                </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-12 justify-center items-start">
                <div className="space-y-8 text-left">

                    <div className="grid gap-6">
                        <FileUploadCard
                            label="ONNX Model"
                            accept=".onnx"
                            onChange={handleSetOnnxFile}
                            fileName={onnxFile?.name}
                            iconName="psychology"
                            colorClass="blue"
                        />
                        <FileUploadCard
                            label="Class Labels (JSON)"
                            accept=".json"
                            onChange={handleSetClassFile}
                            fileName={classFile?.name}
                            iconName="description"
                            colorClass="purple"
                        />
                        <FileUploadCard
                            label="Target Image"
                            accept="image/*"
                            onChange={handleSetImageFile}
                            fileName={imageFile?.name}
                            iconName="image"
                            colorClass="pink"
                        />
                    </div>

                    {/* Section: Preview Labels */}
                    {classLabels.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">View class labels</p>
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <button
                                        className="flex items-center gap-3 px-6 py-3 rounded-full transition-all shadow-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-primary group"
                                    >
                                        <Eye className="w-5 h-5 text-slate-400 group-hover:text-primary" />
                                        <span className="font-semibold">View class labels</span>
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                                    <DialogHeader className="sticky top-0 z-10 bg-background pb-2 border-b border-border">
                                        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                                            <span className="material-symbols-rounded text-primary">format_list_bulleted</span>
                                            Class Labels
                                        </DialogTitle>
                                        <DialogDescription>
                                            This model can classify {classLabels.length} classes.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="mt-4 space-y-2 overflow-y-auto flex-1 pr-1">
                                        {classLabels.map((label, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                                            >
                                                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                                                    {index + 1}
                                                </span>
                                                <span className="font-medium capitalize text-slate-700 dark:text-slate-200">
                                                    {label.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={handleLoadModel}
                            disabled={isLoading || !onnxFile || !classFile}
                            className="flex-1 px-8 py-4 rounded-2xl bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-sm"
                        >
                            {isLoading && !hasSession ? "Loading..." : "1. Load model"}
                        </button>
                        <button
                            onClick={handlePredict}
                            disabled={isLoading || !hasSession || !imageFile}
                            className="flex-1 px-8 py-4 rounded-2xl bg-primary text-white font-semibold shadow-xl shadow-primary/30 hover:shadow-primary/40 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 disabled:hover:translate-y-0"
                        >
                            {isLoading && hasSession ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="material-symbols-rounded block">analytics</span>}
                            {isLoading && hasSession ? "Analyzing..." : "2. Run prediction"}
                        </button>
                    </div>
                </div>

                {/* RIGHT COLUMN: Preview & Results */}
                <div className="relative group">
                    <div ref={previewCardRef} className="relative bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">

                        <div className={`relative flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800 ${!imageFile ? "aspect-[4/3]" : ""}`}>
                            {imageFile ? (
                                <img
                                    ref={selectedImageRef}
                                    src={imageUrl ?? undefined}
                                    alt="Cat Preview"
                                    className="h-auto max-h-[560px] w-auto max-w-full object-contain"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-4 text-slate-400 dark:text-slate-500">
                                    <span className="material-symbols-rounded text-6xl">image</span>
                                    <p className="font-semibold tracking-widest uppercase text-xs">Waiting for Image</p>
                                </div>
                            )}
                        </div>

                        {(predictions.length > 0 || explanationProgress || occlusionHeatmap) && (
                            <div className="grid items-stretch gap-4 bg-slate-50/70 p-4 dark:bg-slate-950/20 md:grid-cols-2 md:p-5">
                                <PredictionResult predictions={predictions.slice(0, 5)} />
                                {explanationProgress ? (
                                    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-400/15 dark:bg-indigo-950/20">
                                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                            <span>Building explanation...</span>
                                            <span>{explanationProgress.completed}/{explanationProgress.total}</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(explanationProgress.completed / explanationProgress.total) * 100}%` }} />
                                        </div>
                                        <button type="button" onClick={cancelOcclusion} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300">
                                            Cancel explanation
                                        </button>
                                    </div>
                                ) : occlusionHeatmap && imageFile ? (
                                    <OcclusionExplanation
                                        imageRef={selectedImageRef}
                                        previewCardRef={previewCardRef}
                                        heatmap={occlusionHeatmap}
                                        onImageReady={handleExplanationImageReady}
                                        onSummarize={handleSummarizeExplanation}
                                        isSummarizing={isSummarizing}
                                    />
                                ) : null}
                            </div>
                        )}
                        {llmSummary && (
                            <div className="border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-200">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-primary">AI explanation summary</p>
                                <p className="whitespace-pre-wrap">{llmSummary}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};
