import { appConfig } from "@/config";

export interface ExplanationMetadata {
  modelName: string;
  predictedClass: string;
  score: number;
  explanationMethod: "Occlusion Sensitivity";
  heatmapGrid: string;
}

export interface LlmExplanationResult {
  summary: string;
  model: string | null;
}

const ZERO_SHOT_PROMPT = `

Analyze the attached cat image with its occlusion-sensitivity heatmap.

The heatmap shows regions that affected the selected model's prediction when those regions were masked. Redder areas indicate stronger positive influence on the predicted class.

Write a concise natural-language assessment in Thai covering:

1. Identify and analyze the cat's breed based on your own visual knowledge.
2. Critically compare and evaluate the model's output against your visual analysis, pointing out any agreements or contradictions.
3. Whether the highlighted regions focus on meaningful parts of the cat.

Output requirements:

* Keep the response extremely concise.
* Do not use any special symbols or formatting characters, such as asterisks (*), markdown formatting, or bullet points. Use plain text only.

`;

export const analyzeExplanationWithOpenRouter = async (
  imageDataUrl: string,
  metadata: ExplanationMetadata
): Promise<LlmExplanationResult> => {
  const apiKey = appConfig.openRouter.apiKey;
  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured.");
  }

  const response = await fetch(appConfig.openRouter.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": appConfig.openRouter.title,
    },
    body: JSON.stringify({
      model: appConfig.openRouter.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${ZERO_SHOT_PROMPT}\nMetadata:\n${JSON.stringify(metadata, null, 2)}`,
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenRouter request failed.");
  }

  const content = payload?.choices?.[0]?.message?.content;
  const summary = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part?.text || "").join(" ").trim()
      : "";

  if (!summary) {
    throw new Error("OpenRouter returned an empty explanation.");
  }

  return { summary, model: payload?.model || null };
};
