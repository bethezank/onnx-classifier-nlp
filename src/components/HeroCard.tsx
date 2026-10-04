import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createOcclusionHeatmap, loadONNXModel, loadClassLabels, preprocessImage, runInference } from "@/utils/onnxInference";
import type { OcclusionHeatmap } from "@/utils/onnxInference";
import type { InferenceSession } from "onnxruntime-web";
import { GoogleIcon } from "./GoogleIcon";
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

const builtInModels = [
    { ...appConfig.models.googleNet, icon: "google" as const },
    { ...appConfig.models.squeezeNet, icon: "layers" as const },
    { ...appConfig.models.resNet18, icon: "layers" as const },
    { ...appConfig.models.resNet50, icon: "layers" as const },
] as const;

export const HeroCard = () => {
    const { toast } = useToast();

    // Independent state for Built-in Model section
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [fetchingModel, setFetchingModel] = useState<string | null>(null);
    const [activeModel, setActiveModel] = useState<string | null>(null);
    const [session, setSession] = useState<InferenceSession | null>(null);
    const [modelSessions, setModelSessions] = useState<Record<string, InferenceSession>>({});
    const [classLabels, setClassLabels] = useState<string[]>([]);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [builtInClassLabels, setBuiltInClassLabels] = useState<string[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [occlusionHeatmap, setOcclusionHeatmap] = useState<OcclusionHeatmap | null>(null);
    const [explanationProgress, setExplanationProgress] = useState<{ completed: number; total: number } | null>(null);
    const [explanationImageDataUrl, setExplanationImageDataUrl] = useState<string | null>(null);
    const [llmSummary, setLlmSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const sessionLoadPromisesRef = useRef<Record<string, Promise<InferenceSession>>>({});
    const occlusionAbortControllerRef = useRef<AbortController | null>(null);
    const selectedImageRef = useRef<HTMLImageElement | null>(null);
    const previewCardRef = useRef<HTMLDivElement | null>(null);
    const selectedImageUrl = useMemo(
        () => selectedImage ? URL.createObjectURL(selectedImage) : null,
        [selectedImage],
    );

    useEffect(() => {
        return () => {
            if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
        };
    }, [selectedImageUrl]);

    const handleExplanationImageReady = useCallback((imageDataUrl: string) => {
        setExplanationImageDataUrl(imageDataUrl);
    }, []);

    const cancelOcclusion = () => {
        occlusionAbortControllerRef.current?.abort();
        occlusionAbortControllerRef.current = null;
        setExplanationProgress(null);
    };

    // Load built-in class labels on mount
    useEffect(() => {
        const loadBuiltInLabels = async () => {
            try {
                const response = await fetch(appConfig.assets.classLabelsUrl);
                const labels = await response.json();
                setBuiltInClassLabels(labels);
            } catch (error) {
                console.error("Failed to load class labels:", error);
            }
        };
        loadBuiltInLabels();
    }, []);

    const fetchBuiltInSession = async (name: string, modelUrl: string) => {
        const cachedSession = modelSessions[name];
        if (cachedSession) {
            return cachedSession;
        }

        const pendingLoad = sessionLoadPromisesRef.current[name];
        if (pendingLoad) {
            return pendingLoad;
        }

        const loadPromise = (async () => {
            const response = await fetch(modelUrl);
            const modelBlob = await response.blob();
            const modelFile = new File([modelBlob], `${name}.onnx`, { type: "application/octet-stream" });
            const loadedSession = await loadONNXModel(modelFile);

            setModelSessions((current) => ({
                ...current,
                [name]: loadedSession,
            }));

            return loadedSession;
        })();

        sessionLoadPromisesRef.current[name] = loadPromise;

        try {
            return await loadPromise;
        } finally {
            delete sessionLoadPromisesRef.current[name];
        }
    };

    const handleModelSelect = async (name: string, modelUrl: string, classUrl: string) => {
        setFetchingModel(name);
        setIsLoading(true);
        setPredictions([]);
        setOcclusionHeatmap(null);
        setExplanationImageDataUrl(null);
        setLlmSummary(null);
        cancelOcclusion();

        try {
            const [loadedSession, cRes] = await Promise.all([
                fetchBuiltInSession(name, modelUrl),
                fetch(classUrl),
            ]);
            const cBlob = await cRes.blob();
            const cFile = new File([cBlob], "labels.json", { type: "application/json" });
            const loadedLabels = await loadClassLabels(cFile);

            setSession(loadedSession);
            setClassLabels(loadedLabels);
            setActiveModel(name);

            toast({
                title: "Model ready",
                description: `${name} loaded successfully and is ready to analyze images.`,
            });
        } catch (e) {
            toast({
                title: "Error",
                description: "Failed to load model",
                variant: "destructive"
            });
            console.error(e);
        } finally {
            setFetchingModel(null);
            setIsLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            cancelOcclusion();
            setSelectedImage(file);
            setPredictions([]);
            setOcclusionHeatmap(null);
            setExplanationImageDataUrl(null);
            setLlmSummary(null);
        }
    };

    const handlePredict = async () => {
        if (!session || !classLabels.length) {
            toast({
                title: "Model Not Ready",
                description: "Please select a model first.",
                variant: "destructive"
            });
            return;
        }
        if (!selectedImage) {
            toast({
                title: "Missing Image",
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
            const selectedModel = builtInModels.find((model) => model.name === activeModel);
            const inputSize = selectedModel?.inputSize ?? 224;
            const inputTensor = await preprocessImage(selectedImage, inputSize);
            const results = await runInference(session, inputTensor, classLabels);
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
                selectedImage,
                inputSize,
                targetClassIndex,
                results[0]?.probability ?? 0,
                {
                    gridSize: appConfig.occlusion.gridSize,
                    signal: abortController.signal,
                    onProgress: setExplanationProgress,
                }
            );
            setOcclusionHeatmap(explanation);
            setExplanationProgress(null);
        } catch (error) {
            const description = error instanceof Error ? error.message : "Unknown inference error";
            if (description !== "Occlusion explanation cancelled.") {
                toast({
                    title: predictionReady ? "Explanation unavailable" : "Analysis Failed",
                    description: predictionReady
                        ? "The prediction is available, but its visual explanation could not be created."
                        : description,
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
        if (!explanationImageDataUrl || !activeModel || !predictions[0]) return;

        setIsSummarizing(true);
        try {
            const result = await analyzeExplanationWithOpenRouter(explanationImageDataUrl, {
                modelName: activeModel,
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

    return (
        <section className="glass-card rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
            <div className="flex flex-col items-start gap-2 mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                    <span className="material-symbols-rounded text-base">auto_awesome</span>
                    Built-in Intelligence
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    Try our models for cat breed classification
                </h3>
                <p className="text-muted-foreground text-base">
                    Run fine-tuned cat breed classifiers directly in your browser with GoogLeNet, SqueezeNet, ResNet-18, and ResNet-50.
                </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-start">

                {/* LEFT COLUMN: Controls */}
                <div className="space-y-8">
                    {/* Section: Model selection */}
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Select a model</p>
                        <div className="flex flex-wrap gap-4">
                            {builtInModels.map((model) => (
                                <button
                                    key={model.name}
                                    onClick={() => handleModelSelect(model.name, model.modelUrl, appConfig.assets.classLabelsUrl)}
                                    disabled={!!fetchingModel}
                                    className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all shadow-sm ${activeModel === model.name
                                        ? "bg-primary text-white shadow-lg shadow-primary/20 border border-transparent"
                                        : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary group text-slate-700 dark:text-slate-200"
                                        }`}
                                >
                                    {fetchingModel === model.name ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : model.icon === "google" ? (
                                        <GoogleIcon className="w-5 h-5" />
                                    ) : (
                                        <span className={`material-symbols-rounded ${activeModel === model.name ? "text-white" : "text-slate-400 group-hover:text-primary"}`}>layers</span>
                                    )}
                                    <span className="font-semibold">{model.label}</span>
                                </button>
                            ))}
                        </div>

                        <div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <button className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-full bg-slate-100/90 text-slate-700 border border-slate-300 shadow-sm hover:bg-white hover:border-slate-400 hover:text-slate-900 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-800 dark:hover:border-slate-500 transition-all">
                                        <span className="material-symbols-rounded text-[18px] text-slate-500 dark:text-slate-400">info</span>
                                        Model accuracy details
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl text-center md:text-left text-slate-900 dark:text-white">Model accuracy details</DialogTitle>
                                        <DialogDescription className="text-center md:text-left text-slate-600 dark:text-slate-400">
                                            Compare the performance of GoogLeNet, SqueezeNet, ResNet-18, and ResNet-50.
                                        </DialogDescription>
                                    </DialogHeader>

                                    <div className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                                        <span className="material-symbols-rounded text-[18px] text-primary">compare_arrows</span>
                                        Model comparison
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-8 mt-6 animate-in fade-in zoom-in-95 duration-200">
                                        {/* GoogLeNet Column */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                                                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                                                    <GoogleIcon className="w-5 h-5" />
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">GoogLeNet</h3>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">grid_on</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Confusion Matrix</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/google-matrix.png" alt="GoogLeNet Confusion Matrix" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">bar_chart</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Classification Report</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/google-score.png" alt="GoogLeNet Score" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SqueezeNet Column */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <span className="material-symbols-rounded">layers</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">SqueezeNet</h3>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">grid_on</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Confusion Matrix</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/squeezenet-matrix.png" alt="SqueezeNet Confusion Matrix" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">bar_chart</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Classification Report</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/squeezenet-score.png" alt="SqueezeNet Score" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ResNet-18 Column */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <span className="material-symbols-rounded">layers</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">ResNet-18</h3>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">grid_on</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Confusion Matrix</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/restnet18-matrix.png" alt="ResNet-18 Confusion Matrix" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">bar_chart</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Classification Report</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/restnet18-score.png" alt="ResNet-18 Score" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ResNet-50 Column */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <span className="material-symbols-rounded">layers</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">ResNet-50</h3>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">grid_on</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Confusion Matrix</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/resnet50-matrix.png" alt="ResNet-50 Confusion Matrix" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-[18px] text-slate-400">bar_chart</span>
                                                        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">Classification Report</h4>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                                                        <img src="/results/resnet50-score.png" alt="ResNet-50 Score" className="w-full h-auto rounded-xl" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Section: Class labels */}
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Class Labels</p>
                        <div className="flex flex-wrap gap-4">
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
                                        <DialogTitle className="flex items-center gap-2">
                                            <span className="material-symbols-rounded text-primary">format_list_bulleted</span>
                                            Class Labels
                                        </DialogTitle>
                                        <DialogDescription>
                                            The 10 cat breeds this model can classify.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="mt-4 space-y-2 overflow-y-auto flex-1 pr-1">
                                        {builtInClassLabels.map((label, index) => (
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
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Upload a cat image for prediction</p>
                        <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-2 text-center hover:bg-white/50 dark:hover:bg-white/5 transition-all cursor-pointer group flex flex-col items-center justify-center">
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-rounded text-primary text-3xl">upload_file</span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400">
                                {selectedImage ? selectedImage.name : <>Drop image here or <span className="text-primary font-semibold">click to browse</span></>}
                            </p>
                        </label>
                    </div>

                    <button
                        onClick={handlePredict}
                        disabled={!selectedImage || !activeModel || isLoading}
                        className="w-full md:w-auto px-10 py-4 bg-primary text-white font-semibold rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <span className="material-symbols-rounded">analytics</span>}
                        {isLoading ? "Analyzing..." : "Predict now"}
                    </button>
                </div>

                {/* RIGHT COLUMN: Preview & Results */}
                <div className="relative group">
                    <div ref={previewCardRef} className="relative bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">

                        <div className={`relative flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800 ${!selectedImage ? "aspect-[4/3]" : ""}`}>
                            {selectedImage ? (
                                <img
                                    ref={selectedImageRef}
                                    src={selectedImageUrl ?? undefined}
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
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width]"
                                            style={{ width: `${(explanationProgress.completed / explanationProgress.total) * 100}%` }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={cancelOcclusion}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300"
                                    >
                                        Cancel explanation
                                    </button>
                                </div>
                                ) : occlusionHeatmap && selectedImage ? (
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
