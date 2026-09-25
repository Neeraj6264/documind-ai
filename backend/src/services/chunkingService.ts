export interface RawChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber?: number;
}

export class ChunkingService {
  /**
   * Split document text into overlapping chunks with smart paragraph and sentence boundary preservation
   */
  public static chunkText(
    text: string,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
      totalPages?: number;
    } = {}
  ): RawChunk[] {
    const { chunkSize = 900, chunkOverlap = 150, totalPages = 1 } = options;

    if (!text || text.trim().length === 0) {
      return [];
    }

    const cleanText = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
    const paragraphs = cleanText.split(/\n\s*\n/);
    const chunks: RawChunk[] = [];

    let currentChunk = '';
    let chunkIndex = 0;
    const totalLength = cleanText.length;

    for (let p = 0; p < paragraphs.length; p++) {
      const paragraph = paragraphs[p].trim();
      if (!paragraph) continue;

      // If adding this paragraph fits in the chunk
      if ((currentChunk + '\n\n' + paragraph).length <= chunkSize) {
        currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      } else {
        // If single paragraph exceeds chunkSize, split it by sentences
        if (paragraph.length > chunkSize) {
          const sentences = paragraph.split(/(?<=[.?!])\s+/);
          for (const sentence of sentences) {
            if ((currentChunk + ' ' + sentence).length <= chunkSize) {
              currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            } else {
              if (currentChunk.trim().length > 0) {
                // Approximate page number
                const charOffset = chunks.reduce((sum, c) => sum + c.content.length, 0);
                const estimatedPage = Math.min(
                  totalPages,
                  Math.max(1, Math.ceil((charOffset / Math.max(1, totalLength)) * totalPages))
                );

                chunks.push({
                  chunkIndex,
                  content: currentChunk.trim(),
                  tokenCount: this.estimateTokenCount(currentChunk.trim()),
                  pageNumber: estimatedPage,
                });
                chunkIndex++;

                // Prepare next chunk with overlap
                const overlapText = this.getOverlap(currentChunk, chunkOverlap);
                currentChunk = overlapText ? `${overlapText} ${sentence}` : sentence;
              } else {
                currentChunk = sentence;
              }
            }
          }
        } else {
          // Push current chunk
          if (currentChunk.trim().length > 0) {
            const charOffset = chunks.reduce((sum, c) => sum + c.content.length, 0);
            const estimatedPage = Math.min(
              totalPages,
              Math.max(1, Math.ceil((charOffset / Math.max(1, totalLength)) * totalPages))
            );

            chunks.push({
              chunkIndex,
              content: currentChunk.trim(),
              tokenCount: this.estimateTokenCount(currentChunk.trim()),
              pageNumber: estimatedPage,
            });
            chunkIndex++;

            const overlapText = this.getOverlap(currentChunk, chunkOverlap);
            currentChunk = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;
          } else {
            currentChunk = paragraph;
          }
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        chunkIndex,
        content: currentChunk.trim(),
        tokenCount: this.estimateTokenCount(currentChunk.trim()),
        pageNumber: totalPages,
      });
    }

    return chunks;
  }

  private static getOverlap(text: string, overlapLength: number): string {
    if (text.length <= overlapLength) return text;
    const slice = text.slice(text.length - overlapLength);
    // Break at the first space to avoid partial word
    const firstSpace = slice.indexOf(' ');
    return firstSpace !== -1 ? slice.slice(firstSpace + 1) : slice;
  }

  public static estimateTokenCount(text: string): number {
    // English words ~ 4 characters per token
    return Math.ceil(text.length / 4);
  }
}
