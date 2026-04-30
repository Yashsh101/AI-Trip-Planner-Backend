import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { KnowledgeChunk } from '../../src/types';

const REQUIRED_DESTINATIONS = [
  'Tokyo, Japan',
  'Paris, France',
  'Bali, Indonesia',
  'New York City, USA',
  'Bangkok, Thailand',
  'Rome, Italy',
  'Dubai, UAE',
  'London, UK',
  'Singapore',
  'Sydney, Australia',
];

const REQUIRED_CATEGORIES = ['attractions', 'food', 'transport', 'culture', 'practical'] as const;

const chunks = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'destinations.json'), 'utf-8'),
) as KnowledgeChunk[];

describe('travel knowledge base', () => {
  it('contains at least 70 chunks across the target destinations', () => {
    expect(chunks.length).toBeGreaterThanOrEqual(70);
    expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(chunks.length);
  });

  it('covers every required destination and core category', () => {
    for (const destination of REQUIRED_DESTINATIONS) {
      const destinationChunks = chunks.filter((chunk) => chunk.destination === destination);
      const categories = new Set(destinationChunks.map((chunk) => chunk.category));

      expect(destinationChunks.length, destination).toBeGreaterThanOrEqual(7);
      for (const category of REQUIRED_CATEGORIES) {
        expect(categories.has(category), `${destination} missing ${category}`).toBe(true);
      }
    }
  });
});
