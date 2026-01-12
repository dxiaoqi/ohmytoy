// Token counting utilities
// Note: For production, consider using a proper tokenizer library like tiktoken

export function getTokenizer(_model: string): (text: string) => number[] {
  // Simplified tokenizer - in production, use tiktoken or similar
  return (text: string) => {
    // Basic estimation: split by whitespace and punctuation
    return text.split(/\s+/).map((_, i) => i);
  };
}

export function countTokens(text: string, _model: string = "gpt-4"): number {
  // Simplified token counting
  // In production, use tiktoken or similar library
  return estimateTokens(text);
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.max(1, Math.floor(text.length / 4));
}

export function truncateText(
  text: string,
  model: string,
  maxTokens: number,
  suffix: string = "\n... [truncated]",
  preserveLines: boolean = true
): string {
  const currentTokens = countTokens(text, model);
  if (currentTokens <= maxTokens) {
    return text;
  }

  const suffixTokens = countTokens(suffix, model);
  const targetTokens = maxTokens - suffixTokens;

  if (targetTokens <= 0) {
    return suffix.trim();
  }

  if (preserveLines) {
    return truncateByLines(text, targetTokens, suffix, model);
  } else {
    return truncateByChars(text, targetTokens, suffix, model);
  }
}

function truncateByLines(
  text: string,
  targetTokens: number,
  suffix: string,
  model: string
): string {
  const lines = text.split("\n");
  const resultLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line + "\n", model);
    if (currentTokens + lineTokens > targetTokens) {
      break;
    }
    resultLines.push(line);
    currentTokens += lineTokens;
  }

  if (resultLines.length === 0) {
    return truncateByChars(text, targetTokens, suffix, model);
  }

  return resultLines.join("\n") + suffix;
}

function truncateByChars(
  text: string,
  targetTokens: number,
  suffix: string,
  model: string
): string {
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (countTokens(text.substring(0, mid), model) <= targetTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return text.substring(0, low) + suffix;
}
