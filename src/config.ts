type Env = Record<string, string | undefined>;

const env = import.meta.env as Env;

const readString = (name: string, fallback: string): string => env[name] || fallback;

const readNumber = (name: string, fallback: number): number => {
  const value = Number(env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const readBoolean = (name: string, fallback: boolean): boolean => {
  const value = env[name]?.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

const readNumberList = (name: string, fallback: number[]): number[] => {
  const values = env[name]
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values?.length ? values : fallback;
};

const defaultMean = [113.84185, 107.20119, 100.25863];
const occlusionGridSize = readNumber("VITE_OCCLUSION_GRID_SIZE", 7);

export const appConfig = {
  onnx: {
    wasmPaths: readString("VITE_ONNX_WASM_PATHS", "/"),
    logLevel: readString("VITE_ONNX_LOG_LEVEL", "fatal"),
  },
  preprocessing: {
    mean: readNumberList("VITE_PREPROCESS_MEAN", defaultMean),
    defaultInputSize: readNumber("VITE_DEFAULT_INPUT_SIZE", 224),
  },
  assets: {
    classLabelsUrl: readString("VITE_CLASS_LABELS_URL", "/classes/classNames-cat.json"),
  },
  inference: {
    topK: readNumber("VITE_INFERENCE_TOP_K", 5),
    supportedImageSizes: readNumberList("VITE_SUPPORTED_IMAGE_SIZES", [224, 227]),
  },
  occlusion: {
    gridSize: occlusionGridSize,
    totalRegions: occlusionGridSize * occlusionGridSize,
    clampNegativeEvidence: readBoolean("VITE_OCCLUSION_CLAMP_NEGATIVE", true),
  },
  visualization: {
    defaultOpacity: readNumber("VITE_HEATMAP_DEFAULT_OPACITY", 0.5),
    minOpacity: readNumber("VITE_HEATMAP_MIN_OPACITY", 0.2),
    maxOpacity: readNumber("VITE_HEATMAP_MAX_OPACITY", 0.8),
    opacityStep: readNumber("VITE_HEATMAP_OPACITY_STEP", 0.05),
    baseAlpha: readNumber("VITE_HEATMAP_BASE_ALPHA", 0.15),
    alphaRange: readNumber("VITE_HEATMAP_ALPHA_RANGE", 0.85),
    hueStart: readNumber("VITE_HEATMAP_HUE_START", 240),
    hueEnd: readNumber("VITE_HEATMAP_HUE_END", 0),
    saturation: readNumber("VITE_HEATMAP_SATURATION", 90),
    lightness: readNumber("VITE_HEATMAP_LIGHTNESS", 55),
    imageQuality: readNumber("VITE_HEATMAP_IMAGE_QUALITY", 0.85),
  },
  models: {
    googleNet: {
      name: readString("VITE_MODEL_GOOGLENET_NAME", "GoogleNet"),
      label: readString("VITE_MODEL_GOOGLENET_LABEL", "GoogLeNet"),
      modelUrl: readString("VITE_MODEL_GOOGLENET_URL", "/models/cat-10breeds-net-google.onnx"),
      inputSize: readNumber("VITE_MODEL_GOOGLENET_INPUT_SIZE", 224),
    },
    squeezeNet: {
      name: readString("VITE_MODEL_SQUEEZENET_NAME", "SqueezeNet"),
      label: readString("VITE_MODEL_SQUEEZENET_LABEL", "SqueezeNet"),
      modelUrl: readString("VITE_MODEL_SQUEEZENET_URL", "/models/cat-10breeds-net-squeezenet.onnx"),
      inputSize: readNumber("VITE_MODEL_SQUEEZENET_INPUT_SIZE", 227),
    },
    resNet18: {
      name: readString("VITE_MODEL_RESNET18_NAME", "ResNet-18"),
      label: readString("VITE_MODEL_RESNET18_LABEL", "ResNet-18"),
      modelUrl: readString("VITE_MODEL_RESNET18_URL", "/models/cat-10breeds-net-resnet18.onnx"),
      inputSize: readNumber("VITE_MODEL_RESNET18_INPUT_SIZE", 224),
    },
    resNet50: {
      name: readString("VITE_MODEL_RESNET50_NAME", "ResNet-50"),
      label: readString("VITE_MODEL_RESNET50_LABEL", "ResNet-50"),
      modelUrl: readString("VITE_MODEL_RESNET50_URL", "/models/cat-10breeds-net-resnet50.onnx"),
      inputSize: readNumber("VITE_MODEL_RESNET50_INPUT_SIZE", 224),
    },
  },
  openRouter: {
    endpoint: readString("VITE_OPENROUTER_ENDPOINT", "https://openrouter.ai/api/v1/chat/completions"),
    apiKey: readString("VITE_OPENROUTER_API_KEY", ""),
    model: readString("VITE_OPENROUTER_MODEL", "openrouter/auto"),
    title: readString("VITE_OPENROUTER_TITLE", "Cat Breed Classifier"),
  },
} as const;
