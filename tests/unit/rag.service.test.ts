import { describe, expect, it } from 'vitest';
import { ragService } from '../../src/services/rag.service';

describe('ragService', () => {
  it('degrades gracefully before the FAISS index is built', async () => {
    const result = await ragService.retrieve('Paris food', 'Paris, France');
    expect(result).toEqual({ context: '', count: 0 });
  });
});
