import { encode as encodeO200k } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encodeCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import type { ModelProfile } from "./types";

export function countTokens(text: string, model: ModelProfile = "o200k"): number {
  if (!text) return 0;
  if (model === "cl100k") return encodeCl100k(text).length;
  if (model === "o200k") return encodeO200k(text).length;
  // "approx": mid-point of the two vocabularies, for Claude/Gemini estimates.
  return Math.round((encodeO200k(text).length + encodeCl100k(text).length) / 2);
}

export function countTokensBoth(text: string): Record<string, number> {
  if (!text) return { o200k: 0, cl100k: 0 };
  return { o200k: encodeO200k(text).length, cl100k: encodeCl100k(text).length };
}
