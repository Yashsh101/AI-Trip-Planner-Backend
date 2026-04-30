import axios from 'axios';
import { config } from '../config';
import { logger } from '../middleware/logger';
import { AppError, type Activity } from '../types';
import { cacheService, CACHE_TTL_SECONDS } from './cache.service';
import { circuitBreakers, timeoutSignal } from './reliability.service';

interface PlaceCandidate {
  geometry?: {
    location?: {
      lat: number;
      lng: number;
    };
  };
  formatted_address?: string;
}

class MapsService {
  async enrichActivity(
    destination: string,
    activity: Activity,
    options?: { signal?: AbortSignal },
  ): Promise<Activity> {
    const cacheKey = cacheService.key('place', {
      destination: destination.toLowerCase(),
      name: activity.name.toLowerCase(),
      location: activity.location.toLowerCase(),
    });
    const cachedPlace = await cacheService.get<{ coordinates: Activity['coordinates'] | null }>(cacheKey);
    if (cachedPlace) {
      return cachedPlace.coordinates ? { ...activity, coordinates: cachedPlace.coordinates } : activity;
    }

    const signal = timeoutSignal(config.UPSTREAM_CALL_TIMEOUT_MS, options?.signal);
    try {
      const response = await circuitBreakers.maps.execute(() =>
        axios.get<{ candidates?: PlaceCandidate[] }>('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
          params: {
            input: `${activity.name}, ${activity.location}, ${destination}`,
            inputtype: 'textquery',
            fields: 'geometry,formatted_address',
            key: config.GOOGLE_MAPS_API_KEY,
          },
          timeout: config.UPSTREAM_CALL_TIMEOUT_MS,
          signal,
        }),
      );

      const location = response.data.candidates?.[0]?.geometry?.location;
      if (!location) {
        await cacheService.set(cacheKey, { coordinates: null }, CACHE_TTL_SECONDS.place);
        return activity;
      }

      const coordinates = {
        lat: location.lat,
        lng: location.lng,
      };
      await cacheService.set(cacheKey, { coordinates }, CACHE_TTL_SECONDS.place);

      return {
        ...activity,
        coordinates,
      };
    } catch (err) {
      // If aborted due to our timeout/cancellation, propagate as typed upstream timeout.
      if (options?.signal?.aborted || signal.aborted) {
        throw new AppError('Upstream timeout while enriching activity', 504, 'UPSTREAM_TIMEOUT', err);
      }

      logger.warn({ event: 'maps_enrich_failed', activity: activity.name, message: String(err) });
      return activity;
    }
  }

  async estimateRouteMinutes(from: Activity, to: Activity): Promise<number | null> {
    if (!from.coordinates || !to.coordinates) return null;

    const cacheKey = cacheService.key('route', {
      from: from.coordinates,
      to: to.coordinates,
    });

    return cacheService.getOrSet(cacheKey, CACHE_TTL_SECONDS.route, async () => {
      const km = this.distanceKm(from.coordinates!, to.coordinates!);
      return Math.max(5, Math.round((km / 18) * 60));
    });
  }

  private distanceKm(from: NonNullable<Activity['coordinates']>, to: NonNullable<Activity['coordinates']>): number {
    const radiusKm = 6371;
    const dLat = this.toRadians(to.lat - from.lat);
    const dLng = this.toRadians(to.lng - from.lng);
    const fromLat = this.toRadians(from.lat);
    const toLat = this.toRadians(to.lat);

    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2;
    return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}

export const mapsService = new MapsService();
