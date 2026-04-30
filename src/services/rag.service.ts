import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { KnowledgeChunk } from '../types';
import { logger } from '../middleware/logger';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const TOP_K = 5;
const DATA_DIR = join(process.cwd(), 'data');

interface FeatureOutput {
  data: Float32Array;
}

interface Embedder {
  (input: string, options: { pooling: 'mean'; normalize: boolean }): Promise<FeatureOutput>;
}

interface FaissIndex {
  search(vector: number[], k: number): { labels: number[] };
}

class RAGService {
  private embedder: Embedder | null = null;
  private index: FaissIndex | null = null;
  private chunks: KnowledgeChunk[] = [];
  private ready = false;

  async init(): Promise<void> {
    const indexPath = join(DATA_DIR, 'faiss.index');
    const chunksPath = join(DATA_DIR, 'chunks.json');

    if (!existsSync(indexPath) || !existsSync(chunksPath)) {
      logger.warn({
        event: 'rag_index_missing',
        message: 'RAG index not built. Run: npm run build:index',
      });
      return;
    }

    try {
      const { pipeline } = await import('@xenova/transformers');
      const faissNode = (await import('faiss-node')) as unknown as { Index: { read(path: string): FaissIndex } };

      this.embedder = (await pipeline('feature-extraction', MODEL_ID)) as Embedder;
      this.index = faissNode.Index.read(indexPath);
      this.chunks = JSON.parse(readFileSync(chunksPath, 'utf-8')) as KnowledgeChunk[];
      this.ready = true;

      logger.info({ event: 'rag_ready', chunks: this.chunks.length });
    } catch (err) {
      logger.warn({ event: 'rag_init_failed', message: String(err) });
    }
  }

  async retrieve(query: string, destination: string): Promise<{ context: string; count: number }> {
    if (!this.ready || !this.embedder || !this.index) {
      return { context: '', count: 0 };
    }

    try {
      const output = await this.embedder(query, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data);
      const { labels } = this.index.search(vector, TOP_K * 3);

      const city = destination.toLowerCase().split(',')[0]?.trim() ?? destination.toLowerCase();
      const relevant = labels
        .map((index) => this.chunks[index])
        .filter((chunk): chunk is KnowledgeChunk => Boolean(chunk))
        .filter((chunk) => chunk.destination.toLowerCase().includes(city))
        .slice(0, TOP_K);

      if (!relevant.length) {
        logger.warn({ event: 'rag_no_results', destination });
        return { context: '', count: 0 };
      }

      const context = relevant
        .map((chunk) => `[${chunk.category.toUpperCase()}]\n${chunk.content}`)
        .join('\n\n---\n\n');

      logger.info({ event: 'rag_retrieved', count: relevant.length, destination });
      return { context, count: relevant.length };
    } catch (err) {
      logger.warn({ event: 'rag_retrieve_failed', destination, message: String(err) });
      return { context: '', count: 0 };
    }
  }

  isReady(): boolean {
    return this.ready;
  }
}

export const ragService = new RAGService();
