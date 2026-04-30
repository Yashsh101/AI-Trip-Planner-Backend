import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { KnowledgeChunk } from '../src/types';

const DATA = join(__dirname, '../data');

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(join(DATA, 'destinations.json'), 'utf-8')) as KnowledgeChunk[];
  const { pipeline } = await import('@xenova/transformers');
  const faissNode = (await import('faiss-node')) as unknown as {
    IndexFlatL2: new (dim: number) => { add(vectors: number[]): void; write(path: string): void };
  };

  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const index = new faissNode.IndexFlatL2(384);
  const clean: KnowledgeChunk[] = [];
  const vectors: number[] = [];

  console.log(`Embedding ${raw.length} chunks...`);

  for (let i = 0; i < raw.length; i += 1) {
    const chunk = raw[i];
    const out = await embedder(chunk.content, { pooling: 'mean', normalize: true });
    vectors.push(...Array.from(out.data as Float32Array));
    clean.push(chunk);
    process.stdout.write(`\r${i + 1}/${raw.length}`);
  }

  console.log('\nWriting index...');
  index.add(vectors);
  index.write(join(DATA, 'faiss.index'));
  writeFileSync(join(DATA, 'chunks.json'), JSON.stringify(clean, null, 2));

  console.log(`\nDone: ${clean.length} chunks, dim=384`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
