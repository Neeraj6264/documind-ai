import OpenAI from 'openai';
import { Response } from 'express';
import { config } from '../config/env.js';
import { EmbeddingService } from './embeddingService.js';
import { VectorService } from './vectorService.js';
import { prisma } from '../db/prisma.js';
import { QuerySearchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class RagService {
  private static openai: OpenAI | null = null;

  private static getClient(): OpenAI {
    if (!this.openai) {
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return this.openai;
  }

  /**
   * Execute full RAG pipeline for a question within a strictly scoped tenant
   */
  public static async query({
    organizationId,
    userId,
    conversationId,
    question,
    topK = 4,
  }: {
    organizationId: string;
    userId: string;
    conversationId?: string;
    question: string;
    topK?: number;
  }): Promise<{
    answer: string;
    citations: QuerySearchResult[];
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
  }> {
    // 1. Generate Query Embedding
    const queryEmbedding = await EmbeddingService.generateEmbedding(question);

    // 2. Vector Search strictly scoped to the tenant
    const citations = await VectorService.searchSimilarChunks(
      organizationId,
      queryEmbedding,
      topK,
      0.25 // relevance threshold
    );

    // 3. Resolve or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: {
          organizationId,
          userId,
          title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
        },
      });
      convId = conv.id;
    } else {
      // Validate conversation belongs to this organization
      const existingConv = await prisma.conversation.findFirst({
        where: { id: convId, organizationId },
      });
      if (!existingConv) {
        throw new Error('Conversation not found or access denied');
      }
    }

    // 4. Save user message to database
    const userMessage = await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'USER',
        content: question,
      },
    });

    // 5. Fetch recent conversation history (scoped to conversation)
    const history = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    history.reverse();

    // 6. Build Grounded Prompt
    const contextText =
      citations.length > 0
        ? citations
            .map(
              (c, i) =>
                `[Source ${i + 1} - "${c.documentTitle}" (Page ${c.pageNumber || 'N/A'})]:\n${c.content}`
            )
            .join('\n\n---\n\n')
        : 'NO RELEVANT DOCUMENTS FOUND IN TENANT WORKSPACE.';

    const systemPrompt = `You are DocuMind AI, an enterprise-grade AI Document Assistant.
You answer user questions strictly and accurately based on the provided context retrieved from the user's workspace documents.

STRICT OPERATIONAL RULES:
1. ONLY use information directly stated in the context below.
2. If the context does not contain enough information to answer the question, state clearly: "I cannot find the answer to this question in the uploaded documents." Do NOT attempt to fabricate, speculate, or draw from outside knowledge.
3. Every factual claim must be backed by the provided context.
4. When stating facts, cite the source in your text using [Source X] format (e.g. "According to [Source 1]...").
5. Keep your tone professional, concise, and helpful. Use markdown formatting (bullet points, bold text) for clarity.

CONTEXT FROM UPLOADED DOCUMENTS:
${contextText}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history
        .filter((m) => m.id !== userMessage.id)
        .map((m) => ({
          role: (m.role.toLowerCase() as 'user' | 'assistant'),
          content: m.content,
        })),
      { role: 'user', content: question },
    ];

    // 7. Call LLM
    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      messages,
      temperature: 0.1, // Low temperature for high precision and zero hallucination
    });

    const answer = completion.choices[0]?.message?.content || 'No response generated.';

    // 8. Save Assistant Message with Citations
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'ASSISTANT',
        content: answer,
        tokens: completion.usage?.total_tokens || 0,
      },
    });

    // Save citations linking message to chunks
    if (citations.length > 0) {
      await prisma.messageCitation.createMany({
        data: citations.map((c) => ({
          messageId: assistantMessage.id,
          chunkId: c.id,
          similarity: c.similarity,
          snippet: c.content.slice(0, 300),
        })),
      });
    }

    return {
      answer,
      citations,
      conversationId: convId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  }

  /**
   * Stream RAG response using Server-Sent Events (SSE)
   */
  public static async streamQuery({
    organizationId,
    userId,
    conversationId,
    question,
    res,
    topK = 4,
  }: {
    organizationId: string;
    userId: string;
    conversationId?: string;
    question: string;
    res: Response;
    topK?: number;
  }): Promise<void> {
    // 1. Generate Query Embedding
    const queryEmbedding = await EmbeddingService.generateEmbedding(question);

    // 2. Vector Search strictly scoped to the tenant
    const citations = await VectorService.searchSimilarChunks(
      organizationId,
      queryEmbedding,
      topK,
      0.25
    );

    // 3. Resolve or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: {
          organizationId,
          userId,
          title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
        },
      });
      convId = conv.id;
    } else {
      const existingConv = await prisma.conversation.findFirst({
        where: { id: convId, organizationId },
      });
      if (!existingConv) {
        throw new Error('Conversation not found or access denied');
      }
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'USER',
        content: question,
      },
    });

    // Send initial metadata event with citations and conversation ID
    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        conversationId: convId,
        userMessageId: userMessage.id,
        citations,
      })}\n\n`
    );

    // Build context
    const contextText =
      citations.length > 0
        ? citations
            .map(
              (c, i) =>
                `[Source ${i + 1} - "${c.documentTitle}" (Page ${c.pageNumber || 'N/A'})]:\n${c.content}`
            )
            .join('\n\n---\n\n')
        : 'NO RELEVANT DOCUMENTS FOUND IN TENANT WORKSPACE.';

    const systemPrompt = `You are DocuMind AI, an enterprise-grade AI Document Assistant.
You answer user questions strictly and accurately based on the provided context retrieved from the user's workspace documents.

STRICT OPERATIONAL RULES:
1. ONLY use information directly stated in the context below.
2. If the context does not contain enough information to answer the question, state clearly: "I cannot find the answer to this question in the uploaded documents." Do NOT attempt to fabricate, speculate, or draw from outside knowledge.
3. Every factual claim must be backed by the provided context.
4. When stating facts, cite the source in your text using [Source X] format (e.g. "According to [Source 1]...").
5. Keep your tone professional, concise, and helpful. Use markdown formatting (bullet points, bold text) for clarity.

CONTEXT FROM UPLOADED DOCUMENTS:
${contextText}`;

    const client = this.getClient();
    const stream = await client.chat.completions.create({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      stream: true,
    });

    let fullAnswer = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAnswer += content;
        res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
      }
    }

    // Save Assistant Message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: convId,
        role: 'ASSISTANT',
        content: fullAnswer,
      },
    });

    if (citations.length > 0) {
      await prisma.messageCitation.createMany({
        data: citations.map((c) => ({
          messageId: assistantMessage.id,
          chunkId: c.id,
          similarity: c.similarity,
          snippet: c.content.slice(0, 300),
        })),
      });
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        assistantMessageId: assistantMessage.id,
      })}\n\n`
    );
    res.end();
  }
}
