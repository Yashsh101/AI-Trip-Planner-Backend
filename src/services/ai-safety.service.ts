import { AppError, type TripRequest } from '../types';

const PROMPT_INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior|above) instructions\b/i,
  /\bsystem prompt\b/i,
  /\bdeveloper message\b/i,
  /\breveal (the )?(prompt|instructions|secrets)\b/i,
  /\bact as\b.+\b(system|developer)\b/i,
  /\bdo not follow\b.+\binstructions\b/i,
];

class AiSafetyService {
  assertSafeTripRequest(request: TripRequest): void {
    const fields = [request.destination, request.travelStyle, request.budget, ...request.interests].join(' ');
    const matched = PROMPT_INJECTION_PATTERNS.find((pattern) => pattern.test(fields));
    if (!matched) return;

    throw new AppError('Trip request contains unsafe prompt-injection style instructions', 400, 'VALIDATION_ERROR', {
      reason: 'prompt_injection_detected',
    });
  }

  sanitizeModelJson(raw: string): string {
    const withoutFences = raw
      .replace(/^\uFEFF/, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '');

    return Array.from(withoutFences)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || code >= 32;
      })
      .join('')
      .trim();
  }

  extractLikelyJsonObject(raw: string): string | null {
    const sanitized = this.sanitizeModelJson(raw);
    const start = sanitized.indexOf('{');
    const end = sanitized.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return sanitized.slice(start, end + 1);
  }
}

export const aiSafetyService = new AiSafetyService();
