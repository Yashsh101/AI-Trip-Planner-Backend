import type { Activity, Itinerary, ItineraryQualityScore, TripRequest } from '../types';
import { mapsService } from './maps.service';

const BUDGET_DAILY_TARGETS: Record<TripRequest['budget'], number> = {
  budget: 90,
  mid: 220,
  luxury: 650,
};

class ItineraryEvaluatorService {
  async evaluate(itinerary: Itinerary, request?: TripRequest): Promise<ItineraryQualityScore> {
    const feasibilityScore = this.scoreFeasibility(itinerary);
    const routeEfficiencyScore = await this.scoreRouteEfficiency(itinerary);
    const weatherRiskScore = this.scoreWeatherRisk(itinerary);
    const budgetFitScore = this.scoreBudgetFit(itinerary, request);
    const preferenceMatchScore = this.scorePreferenceMatch(itinerary, request);

    const overallQualityScore = Math.round(
      feasibilityScore * 0.25 +
        routeEfficiencyScore * 0.2 +
        weatherRiskScore * 0.15 +
        budgetFitScore * 0.2 +
        preferenceMatchScore * 0.2,
    );

    return {
      feasibilityScore,
      routeEfficiencyScore,
      weatherRiskScore,
      budgetFitScore,
      preferenceMatchScore,
      overallQualityScore,
      signals: this.signals({
        feasibilityScore,
        routeEfficiencyScore,
        weatherRiskScore,
        budgetFitScore,
        preferenceMatchScore,
      }),
    };
  }

  private scoreFeasibility(itinerary: Itinerary): number {
    let score = 100;
    if (itinerary.days.length !== itinerary.duration) score -= 30;

    for (const day of itinerary.days) {
      const activities = this.dayActivities(day);
      if (activities.length < 4 || activities.length > 8) score -= 10;

      const summedCost = activities.reduce((sum, activity) => sum + activity.estimatedCostUSD, 0);
      if (Math.abs(summedCost - day.dailyCostUSD) > 5) score -= 8;

      const uniqueNames = new Set(activities.map((activity) => activity.name.toLowerCase()));
      if (uniqueNames.size !== activities.length) score -= 6;
    }

    return this.clamp(score);
  }

  private async scoreRouteEfficiency(itinerary: Itinerary): Promise<number> {
    const estimates: number[] = [];

    for (const day of itinerary.days) {
      const activities = this.dayActivities(day);
      for (let i = 1; i < activities.length; i += 1) {
        const minutes = await mapsService.estimateRouteMinutes(activities[i - 1], activities[i]);
        if (minutes !== null) estimates.push(minutes);
      }
    }

    if (!estimates.length) return 75;

    const averageMinutes = estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
    if (averageMinutes <= 20) return 100;
    if (averageMinutes <= 35) return 85;
    if (averageMinutes <= 55) return 65;
    return 45;
  }

  private scoreWeatherRisk(itinerary: Itinerary): number {
    let score = 100;
    const riskWords = /\b(rain|storm|snow|heat|humid|wind|typhoon|flood)\b/i;

    for (const day of itinerary.days) {
      const hasRisk = Boolean(day.weatherNote && riskWords.test(day.weatherNote));
      if (!hasRisk) continue;

      const hasIndoorPlan = this.dayActivities(day).some((activity) =>
        ['food', 'accommodation'].includes(activity.type) || /museum|gallery|indoor|market|cafe|restaurant/i.test(activity.description),
      );
      score -= hasIndoorPlan ? 4 : 14;
    }

    return this.clamp(score);
  }

  private scoreBudgetFit(itinerary: Itinerary, request?: TripRequest): number {
    const budget = request?.budget ?? (itinerary.budget as TripRequest['budget']);
    const targetDaily = BUDGET_DAILY_TARGETS[budget] ?? BUDGET_DAILY_TARGETS.mid;
    const targetTotal = targetDaily * itinerary.duration;
    const ratio = itinerary.totalEstimatedCostUSD / targetTotal;

    if (ratio <= 1) return 100;
    if (ratio <= 1.15) return 85;
    if (ratio <= 1.35) return 65;
    if (ratio <= 1.75) return 45;
    return 25;
  }

  private scorePreferenceMatch(itinerary: Itinerary, request?: TripRequest): number {
    if (!request?.interests.length) return 75;

    const searchable = this.allActivities(itinerary)
      .map((activity) => `${activity.name} ${activity.description} ${activity.type}`)
      .join(' ')
      .toLowerCase();

    const matched = request.interests.filter((interest) => searchable.includes(interest.toLowerCase())).length;
    return this.clamp(Math.round((matched / request.interests.length) * 100));
  }

  private signals(scores: Omit<ItineraryQualityScore, 'overallQualityScore' | 'signals'>): string[] {
    const signals: string[] = [];
    if (scores.feasibilityScore >= 85) signals.push('Feasible daily pacing and cost accounting');
    if (scores.routeEfficiencyScore < 70) signals.push('Route plan may include avoidable transit overhead');
    if (scores.weatherRiskScore < 85) signals.push('Weather-sensitive days need stronger indoor alternatives');
    if (scores.budgetFitScore >= 85) signals.push('Estimated costs fit the selected budget tier');
    if (scores.preferenceMatchScore >= 80) signals.push('Activities align with requested interests');
    return signals;
  }

  private allActivities(itinerary: Itinerary): Activity[] {
    return itinerary.days.flatMap((day) => this.dayActivities(day));
  }

  private dayActivities(day: Itinerary['days'][number]): Activity[] {
    return [...day.morning, ...day.afternoon, ...day.evening];
  }

  private clamp(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

export const itineraryEvaluatorService = new ItineraryEvaluatorService();
