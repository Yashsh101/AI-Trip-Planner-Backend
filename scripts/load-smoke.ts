const baseUrl = process.env.LOAD_BASE_URL ?? 'http://localhost:3001';
const requests = Number(process.env.LOAD_REQUESTS ?? 25);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 5);

async function hitHealth(): Promise<number> {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/v1/health`);
  if (!response.ok) throw new Error(`health returned ${response.status}`);
  return Date.now() - startedAt;
}

async function main(): Promise<void> {
  const latencies: number[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < requests) {
      cursor += 1;
      latencies.push(await hitHealth());
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95) - 1] ?? 0;

  console.log(
    JSON.stringify({
      baseUrl,
      requests,
      concurrency,
      minMs: latencies[0] ?? 0,
      p95Ms: p95,
      maxMs: latencies.at(-1) ?? 0,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
