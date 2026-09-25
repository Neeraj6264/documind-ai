import fs from 'fs';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { logger } from '../utils/logger.js';

export interface ParsedDocumentResult {
  text: string;
  pageCount: number;
  metadata?: Record<string, unknown>;
}

export class ParsingService {
  /**
   * Parse a file buffer according to its mimetype or file extension
   */
  public static async parseFile(
    filePath: string,
    mimeType: string,
    fileName: string
  ): Promise<ParsedDocumentResult> {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    try {
      if (mimeType.includes('pdf') || extension === 'pdf') {
        return await this.parsePdf(filePath);
      } else if (
        mimeType.includes('wordprocessingml') ||
        mimeType.includes('msword') ||
        extension === 'docx' ||
        extension === 'doc'
      ) {
        return await this.parseDocx(filePath);
      } else if (mimeType.includes('text') || extension === 'txt' || extension === 'md') {
        return await this.parseTxt(filePath);
      } else {
        // Fallback: try reading as text
        return await this.parseTxt(filePath);
      }
    } catch (error) {
      logger.error(`Failed to parse file ${fileName}:`, error);
      throw new Error(`Failed to extract text from ${fileName}: ${(error as Error).message}`);
    }
  }

  private static async parsePdf(filePath: string): Promise<ParsedDocumentResult> {
    const dataBuffer = fs.readFileSync(filePath);
    // pdf-parse extracts text and page info
    const data = await (pdfParse as unknown as (buffer: Buffer) => Promise<{ text: string; numpages: number; info?: unknown }>)(dataBuffer);
    
    return {
      text: data.text || '',
      pageCount: data.numpages || 1,
      metadata: (data.info as Record<string, unknown>) || {},
    };
  }

  private static async parseDocx(filePath: string): Promise<ParsedDocumentResult> {
    const result = await mammoth.extractRawText({ path: filePath });
    // Approximate page count: ~500 words per page
    const words = result.value.split(/\s+/).filter(Boolean).length;
    const estimatedPages = Math.max(1, Math.ceil(words / 500));

    return {
      text: result.value || '',
      pageCount: estimatedPages,
      metadata: {
        messages: result.messages,
      },
    };
  }

  private static async parseTxt(filePath: string): Promise<ParsedDocumentResult> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const estimatedPages = Math.max(1, Math.ceil(lines / 45));

    return {
      text: content,
      pageCount: estimatedPages,
      metadata: {},
    };
  }
}
