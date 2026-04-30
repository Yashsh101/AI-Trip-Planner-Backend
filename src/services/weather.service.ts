import axios from 'axios';
import { config } from '../config';
import { logger } from '../middleware/logger';
import type { DayWeather } from '../types';
import { cacheService, CACHE_TTL_SECONDS } from './cache.service';
import { circuitBreakers, timeoutSignal } from './reliability.service';

interface GeocodeResult {
  lat: number;
  lon: number;
}

interface ForecastItem {
  dt_txt: string;
  main: {
    temp_min: number;
    temp_max: number;
  };
  weather: Array<{ description: string; icon: string }>;
  rain?: { '3h'?: number };
}

interface ForecastResponse {
  list: ForecastItem[];
}

class WeatherService {
  async forecast(
    destination: string,
    startDate: string | undefined,
    options?: { signal?: AbortSignal },
  ): Promise<DayWeather[]> {
    const cacheKey = cacheService.key('weather', { destination: destination.toLowerCase(), startDate: startDate ?? 'none' });
    return cacheService.getOrSet(cacheKey, CACHE_TTL_SECONDS.weather, () =>
      this.fetchForecast(destination, startDate, options),
    );
  }

  private async fetchForecast(
    destination: string,
    startDate: string | undefined,
    options?: { signal?: AbortSignal },
  ): Promise<DayWeather[]> {
    const signal = timeoutSignal(config.UPSTREAM_CALL_TIMEOUT_MS, options?.signal);
    try {
      return await circuitBreakers.weather.execute(async () => {
        const geo = await axios.get<GeocodeResult[]>('https://api.openweathermap.org/geo/1.0/direct', {
          params: { q: destination, limit: 1, appid: config.OPENWEATHER_API_KEY },
          timeout: config.UPSTREAM_CALL_TIMEOUT_MS,
          signal,
        });

        const first = geo.data[0];
        if (!first) return [];

        const forecast = await axios.get<ForecastResponse>('https://api.openweathermap.org/data/2.5/forecast', {
          params: { lat: first.lat, lon: first.lon, units: 'metric', appid: config.OPENWEATHER_API_KEY },
          timeout: config.UPSTREAM_CALL_TIMEOUT_MS,
          signal,
        });

        return this.groupByDay(forecast.data.list, startDate);
      });
    } catch (err) {
      // Keep quiet on cancellation; route will emit typed SSE timeout/error.
      if (options?.signal?.aborted || signal.aborted) return [];
      logger.warn({ event: 'weather_unavailable', destination, message: String(err) });
      return [];
    }
  }

  toPromptContext(weather: DayWeather[]): string {
    if (!weather.length) return 'Weather unavailable. Do not invent precise forecast details.';

    return weather
      .map(
        (day) =>
          `${day.date}: ${day.condition}, ${day.tempLowC}-${day.tempHighC}C, precipitation ${day.precipitationMm}mm.`,
      )
      .join('\n');
  }

  private groupByDay(items: ForecastItem[], startDate?: string): DayWeather[] {
    const byDate = new Map<string, ForecastItem[]>();
    for (const item of items) {
      const date = item.dt_txt.slice(0, 10);
      const bucket = byDate.get(date) ?? [];
      bucket.push(item);
      byDate.set(date, bucket);
    }

    const start = startDate ? new Date(startDate).toISOString().slice(0, 10) : null;
    return Array.from(byDate.entries())
      .filter(([date]) => !start || date >= start)
      .slice(0, 7)
      .map(([date, values]) => ({
        date,
        condition: values[Math.floor(values.length / 2)]?.weather[0]?.description ?? 'variable conditions',
        tempHighC: Math.round(Math.max(...values.map((value) => value.main.temp_max))),
        tempLowC: Math.round(Math.min(...values.map((value) => value.main.temp_min))),
        precipitationMm: Number(values.reduce((sum, value) => sum + (value.rain?.['3h'] ?? 0), 0).toFixed(1)),
        icon: values[Math.floor(values.length / 2)]?.weather[0]?.icon ?? '01d',
      }));
  }
}

export const weatherService = new WeatherService();
