type CacheKeyInputs = {
  destination: string;
  duration: number;
  budget: string;
  interests: string[];
  travelStyle: string;
  startDate?: string;
  promptVersion: string;
  modelVersion: string;
};

function normalizeDestination(destination: string): string {
  return destination
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeInterests(interests: string[]): string[] {
  return Array.from(
    new Set(
      interests
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is string => s.length > 0)
        .sort(),
    ),
  );
}

function normalizeStartDate(startDate?: string): string {
  if (!startDate) return 'none';

  const d = new Date(startDate);
  // Schema should guarantee validity, but we still keep this deterministic.
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d.toISOString();
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildItineraryCacheKey({
  destination,
  duration,
  budget,
  interests,
  travelStyle,
  startDate,
  promptVersion,
  modelVersion,
}: CacheKeyInputs): string {
  const normalizedDestination = normalizeDestination(destination);
  const normalizedInterests = normalizeInterests(interests);
  const normalizedStartDate = normalizeStartDate(startDate);

  const interestsPart = normalizedInterests.join(',');

  return [
    'itinerary',
    normalizedDestination,
    `${duration}d`,
    encodeSegment(budget.toLowerCase()),
    encodeSegment(travelStyle.toLowerCase()),
    encodeSegment(interestsPart),
    encodeSegment(normalizedStartDate),
    encodeSegment(promptVersion),
    encodeSegment(modelVersion),
  ].join(':');
}
