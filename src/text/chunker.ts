export interface TextSpanChunk {
  text: string;
  start: number;
  end: number;
  tokenCount: number;
}

/**
 * Splits text into overlapping sliding-window chunks along sentence boundaries,
 * preserving character start and end offsets for span-level highlight localization.
 * 
 * @param text Full document text
 * @param targetTokens Number of words/tokens per window (default: 400)
 * @param overlapTokens Number of overlapping words/tokens (default: 50)
 */
export function chunkText(
  text: string,
  targetTokens = 400,
  overlapTokens = 50
): TextSpanChunk[] {
  if (!text || !text.trim()) return [];

  // Match sentences while capturing their character offsets
  const sentenceRegex = /[^.!?\n]+(?:[.!?\n]+|$)/g;
  const sentences: Array<{ text: string; start: number; end: number; words: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const raw = match[0];
    if (raw.trim().length === 0) continue;
    const words = raw.trim().split(/\s+/).length;
    sentences.push({
      text: raw,
      start: match.index,
      end: match.index + raw.length,
      words
    });
  }

  if (sentences.length === 0) {
    return [{
      text,
      start: 0,
      end: text.length,
      tokenCount: text.split(/\s+/).length
    }];
  }

  const chunks: TextSpanChunk[] = [];
  let currentSentences: typeof sentences = [];
  let currentWordCount = 0;
  let idx = 0;

  while (idx < sentences.length) {
    const s = sentences[idx];
    currentSentences.push(s);
    currentWordCount += s.words;

    if (currentWordCount >= targetTokens || idx === sentences.length - 1) {
      const chunkStart = currentSentences[0].start;
      const chunkEnd = currentSentences[currentSentences.length - 1].end;
      const chunkTextStr = text.substring(chunkStart, chunkEnd);

      chunks.push({
        text: chunkTextStr,
        start: chunkStart,
        end: chunkEnd,
        tokenCount: currentWordCount
      });

      // Rewind for overlap
      if (idx === sentences.length - 1) {
        break;
      }

      // Keep trailing sentences that fit within overlapTokens
      let overlapCount = 0;
      const retained: typeof sentences = [];
      for (let j = currentSentences.length - 1; j >= 0; j--) {
        if (overlapCount + currentSentences[j].words <= overlapTokens) {
          retained.unshift(currentSentences[j]);
          overlapCount += currentSentences[j].words;
        } else {
          break;
        }
      }

      currentSentences = retained;
      currentWordCount = overlapCount;
    }

    idx++;
  }

  return chunks.length > 0
    ? chunks
    : [{ text, start: 0, end: text.length, tokenCount: text.split(/\s+/).length }];
}
