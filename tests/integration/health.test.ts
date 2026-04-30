import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

describe('GET /api/health', () => {
  it('returns 200 with status', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('preserves request IDs for traceability', async () => {
    const res = await request(createApp()).get('/api/health').set('x-request-id', 'test-request-123');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('test-request-123');
  });

  it('exposes provider metrics as JSON', async () => {
    const app = createApp();
    await request(app).get('/api/health');
    const res = await request(app).get('/api/health/metrics');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('generatedAt');
    expect(res.body).toHaveProperty('api');
    expect(res.body).toHaveProperty('providers');
    expect(res.body.api['GET /api/health/'].calls).toBeGreaterThanOrEqual(1);
    expect(res.body.api['GET /api/health/'].failures).toBe(0);
  });
});
