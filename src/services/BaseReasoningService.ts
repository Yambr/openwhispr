import { getCleanupSystemPrompt } from "../config/prompts";
import { getSettings } from "../stores/settingsStore";

export interface ReasoningConfig {
  maxTokens?: number;
  temperature?: number;
  contextSize?: number;
  systemPrompt?: string;
  lanUrl?: string;
  baseUrl?: string;
  customApiKey?: string;
  provider?: string;
  disableThinking?: boolean;
  // explicit-requestKind-contract: forwarded to POST /api/reason body.requestKind
  // as the PRIMARY server router, replacing the systemPrompt-presence heuristic.
  // Additive + optional (old callers omit it ⇒ undefined ⇒ JSON drops the key).
  requestKind?: "cleanup" | "agent" | "summary" | "title";
}

export abstract class BaseReasoningService {
  protected isProcessing = false;

  protected getCustomDictionary(): string[] {
    return getSettings().customDictionary;
  }

  protected getPreferredLanguage(): string {
    return getSettings().preferredLanguage || "auto";
  }

  protected getUiLanguage(): string {
    return getSettings().uiLanguage || "en";
  }

  protected getSystemPrompt(agentName: string | null): string {
    return getCleanupSystemPrompt(
      agentName,
      this.getCustomDictionary(),
      this.getPreferredLanguage(),
      this.getUiLanguage()
    );
  }

  protected calculateMaxTokens(
    textLength: number,
    minTokens = 100,
    maxTokens = 2048,
    multiplier = 2
  ): number {
    return Math.max(minTokens, Math.min(textLength * multiplier, maxTokens));
  }

  abstract isAvailable(): Promise<boolean>;

  abstract processText(
    text: string,
    modelId: string,
    agentName?: string | null,
    config?: ReasoningConfig
  ): Promise<string>;
}
