import * as ort from 'onnxruntime-web';
import { appConfig } from '@/config';

ort.env.wasm.wasmPaths = appConfig.onnx.wasmPaths;
ort.env.logLevel = appConfig.onnx.logLevel as typeof ort.env.logLevel;

interface PredictionResult {
  className: string;
  probability: number;
}

export const loadONNXModel = async (modelFile: File): Promise<ort.InferenceSession> => {
  const arrayBuffer = await modelFile.arrayBuffer();
  const session = await ort.InferenceSession.create(arrayBuffer);
  return session;
};

/**
 * Get the square image size expected by the first image input of an ONNX model.
 * Some models (notably SqueezeNet) use 227x227 instead of 224x224.
 */
export const getModelInputSize = (
  session: ort.InferenceSession,
  fallback = appConfig.preprocessing.defaultInputSize,
): number => {
  const inputName = session.inputNames[0];
  const dimensions = session.inputMetadata[inputName]?.dimensions;
  const height = dimensions?.[2];
  const width = dimensions?.[3];

  if (typeof height === "number" && height > 0 && height === width) {
    return height;
  }

  return fallback;
};

export const loadClassLabels = async (classFile: File): Promise<string[]> => {
  const text = await classFile.text();
  const classData = JSON.parse(text);
  return Array.isArray(classData) ? classData : Object.values(classData);
};

export const preprocessImage = async (
  imageFile: File,
  targetSize: number = appConfig.preprocessing.defaultInputSize
): Promise<ort.Tensor> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // mean จาก Netron (data_Mean)
    const mean = appConfig.preprocessing.mean; // R, G, B

    img.onload = () => {
      canvas.width = targetSize;
      canvas.height = targetSize;

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      const imageData = ctx.getImageData(0, 0, targetSize, targetSize);

      // Channel-first: [1, 3, height, width]
      const red: number[] = [];
      const green: number[] = [];
      const blue: number[] = [];

      for (let i = 0; i < imageData.data.length; i += 4) {
        // ลบ mean ต่อ channel
        red.push(imageData.data[i] - mean[0]); // R
        green.push(imageData.data[i + 1] - mean[1]); // G
        blue.push(imageData.data[i + 2] - mean[2]); // B
      }

      // รวมเป็น [R...G...B...] -> NCHW
      const transposedData = red.concat(green).concat(blue);
      const float32Data = Float32Array.from(transposedData);

      const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]);
      resolve(inputTensor);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(imageFile);
  });
};


export const runInference = async (
  session: ort.InferenceSession,
  inputTensor: ort.Tensor,
  classLabels: string[],
  topK: number = appConfig.inference.topK
): Promise<PredictionResult[]> => {
  if (!session.inputNames.length) {
    throw new Error("The ONNX model has no input tensor.");
  }

  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];

  const predictions: PredictionResult[] = [];
  const outputData = output.data as Float32Array;

  const probabilities = Array.from(outputData);
  const indices = probabilities
    .map((prob, index) => ({ prob, index }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, topK);

  for (const { prob, index } of indices) {
    predictions.push({
      className: classLabels[index] || `Class ${index}`,
      probability: prob,
    });
  }

  return predictions;
};

/**
 * Try the two image sizes supported by the application. This is useful for
 * user-provided models because both 224x224 and 227x227 are common ONNX
 * image-classifier input sizes.
 */
export const runInferenceWithImageSizeFallback = async (
  session: ort.InferenceSession,
  imageFile: File,
  classLabels: string[],
  topK: number = appConfig.inference.topK,
): Promise<{ predictions: PredictionResult[]; imageSize: number }> => {
  let lastError: unknown;

  for (const imageSize of appConfig.inference.supportedImageSizes) {
    try {
      const inputTensor = await preprocessImage(imageFile, imageSize);
      const predictions = await runInference(session, inputTensor, classLabels, topK);
      return { predictions, imageSize };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The model rejected both 224x224 and 227x227 input sizes.");
};

export interface OcclusionHeatmap {
  values: number[];
  rows: number;
  columns: number;
}

export interface OcclusionProgress {
  completed: number;
  total: number;
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error("Occlusion explanation cancelled.");
  }
};

const runClassScore = async (
  session: ort.InferenceSession,
  inputTensor: ort.Tensor,
  classIndex: number
): Promise<number> => {
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = inputTensor;
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  return Number((output.data as Float32Array)[classIndex] ?? 0);
};

const preprocessImageData = (imageData: ImageData): ort.Tensor => {
  const mean = appConfig.preprocessing.mean;
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    red.push(imageData.data[index] - mean[0]);
    green.push(imageData.data[index + 1] - mean[1]);
    blue.push(imageData.data[index + 2] - mean[2]);
  }

  return new ort.Tensor(
    "float32",
    Float32Array.from(red.concat(green).concat(blue)),
    [1, 3, imageData.height, imageData.width]
  );
};

/**
 * Measures how much each image region affects one class score by masking it
 * with the model's mean pixel values and running the existing ONNX session.
 */
export const createOcclusionHeatmap = async (
  session: ort.InferenceSession,
  imageFile: File,
  targetSize: number,
  classIndex: number,
  baselineScore: number,
  options: {
    gridSize?: number;
    signal?: AbortSignal;
    onProgress?: (progress: OcclusionProgress) => void;
  } = {}
): Promise<OcclusionHeatmap> => {
  const gridSize = options.gridSize ?? appConfig.occlusion.gridSize;
  const imageUrl = URL.createObjectURL(imageFile);

  try {
    throwIfAborted(options.signal);

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to load image for explanation."));
      element.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Could not create explanation canvas.");
    }

    context.drawImage(image, 0, 0, targetSize, targetSize);
    const originalPixels = context.getImageData(0, 0, targetSize, targetSize);
    const values: number[] = [];
    const total = gridSize * gridSize;
    const mean = appConfig.preprocessing.mean;

    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        throwIfAborted(options.signal);

        const maskedPixels = new Uint8ClampedArray(originalPixels.data);
        const startX = Math.floor((column * targetSize) / gridSize);
        const endX = Math.ceil(((column + 1) * targetSize) / gridSize);
        const startY = Math.floor((row * targetSize) / gridSize);
        const endY = Math.ceil(((row + 1) * targetSize) / gridSize);

        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const pixelIndex = (y * targetSize + x) * 4;
            maskedPixels[pixelIndex] = mean[0];
            maskedPixels[pixelIndex + 1] = mean[1];
            maskedPixels[pixelIndex + 2] = mean[2];
          }
        }

        const maskedImage = new ImageData(maskedPixels, targetSize, targetSize);
        context.putImageData(maskedImage, 0, 0);
        const maskedTensor = await preprocessImageData(context.getImageData(0, 0, targetSize, targetSize));
        const maskedScore = await runClassScore(session, maskedTensor, classIndex);
        const scoreDifference = baselineScore - maskedScore;
        values.push(appConfig.occlusion.clampNegativeEvidence ? Math.max(0, scoreDifference) : scoreDifference);

        options.onProgress?.({ completed: values.length, total });
      }
    }

    return { values, rows: gridSize, columns: gridSize };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};
