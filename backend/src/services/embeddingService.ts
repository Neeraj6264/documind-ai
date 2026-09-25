import OpenAI from 'openai';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class EmbeddingService {
  private static openai: OpenAI | null = null;

  private static getClient(): OpenAI {
    if (!this.openai) {
      if (!config.openaiApiKey) {
        throw new Error(
          'OPENAI_API_KEY is not configured. Please provide your OpenAI API key in .env'
        );
      }
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return this.openai;
  }

  /**
   * Generate 1536-dimensional embedding vector for a single query text
   */
  public static async generateEmbedding(text: string): Promise<number[]> {
    const client = this.getClient();
    const sanitized = text.replace(/\n+/g, ' ').trim();

    try {
      const response = await client.embeddings.create({
        model: config.openaiEmbeddingModel,
        input: sanitized,
        dimensions: 1536,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw new Error(`OpenAI Embedding generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Batch generate embeddings for document chunks
   */
  public static async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = this.getClient();

    // OpenAI supports batches up to 2048 inputs; we chunk into batches of 100 for safety
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.replace(/\n+/g, ' ').trim() || ' ');

      try {
        const response = await client.embeddings.create({
          model: config.openaiEmbeddingModel,
          input: batch,
          dimensions: 1536,
        });

        // Ensure order is preserved
        const sorted = response.data.sort((a, b) => a.index - b.index);
        allEmbeddings.push(...sorted.map((item) => item.embedding));
      } catch (error) {
        logger.error(`Error generating batch embeddings at index ${i}:`, error);
        throw new Error(`Batch embedding generation failed: ${(error as Error).message}`);
      }
    }

    return allEmbeddings;
  }
}
