/**
 * Centralized Threshold Configuration for EnviroWatch (Zeus)
 *
 * All values are clearly documented with units, assumptions, and deterministic rules.
 * Prototype defaults can be safely adjusted without altering business logic.
 */

export interface ThresholdConfig {
  aqi: {
    unit: string;
    warningThreshold: number; // Values >= this trigger Warning ('yellow')
    dangerThreshold: number;  // Values >= this trigger Danger ('red')
    assumptions: string;
  };
  temperature: {
    unit: string;
    warningThresholdCelsius: number; // Celsius >= this triggers Warning ('yellow')
    dangerThresholdCelsius: number;  // Celsius >= this triggers Danger ('red')
    assumptions: string;
  };
  flooding: {
    unit: string;
    warningPrecipProbPercent: number; // Precipitation % >= this triggers Warning
    dangerPrecipProbPercent: number;  // Precipitation % >= this triggers Danger
    warningRain24hMm: number;         // 24h Rainfall mm >= this triggers Warning
    dangerRain24hMm: number;          // 24h Rainfall mm >= this triggers Danger
    minSurveyReportsForCommunityFlood: number; // Min independent reports to escalate
    surveyWindowHours: number;        // Recent hours to consider survey reports
    assumptions: string;
  };
  monitoring: {
    defaultIntervalMinutes: number;
    staleReadingThresholdMinutes: number;
  };
}

export const CENTRAL_THRESHOLDS: ThresholdConfig = {
  aqi: {
    unit: 'AQI (National Air Quality Index)',
    warningThreshold: 101, // 101-150: Unhealthy for sensitive groups
    dangerThreshold: 151,  // > 150: Unhealthy / Severe hazard
    assumptions: 'Based on Central Pollution Control Board (CPCB) & Universal AQI standard brackets.',
  },
  temperature: {
    unit: '°C (Ambient Air Temperature)',
    warningThresholdCelsius: 33.0, // 33°C - 37.9°C: Elevated thermal stress
    dangerThresholdCelsius: 38.0,  // >= 38.0°C: Severe heat hazard (Delhi summer threshold)
    assumptions: 'Derived from Indian Meteorological Department (IMD) heat advisory guidelines for North Delhi.',
  },
  flooding: {
    unit: 'Rainfall (mm/24h) & Probability (%) + Survey Corroboration',
    warningPrecipProbPercent: 35,
    dangerPrecipProbPercent: 70,
    warningRain24hMm: 10.0,
    dangerRain24hMm: 25.0,
    minSurveyReportsForCommunityFlood: 2, // At least 2 independent reports required
    surveyWindowHours: 3,                 // Within past 3 hours
    assumptions: 'Runoff risk calculated from precipitation volume combined with corroborated citizen ground truth.',
  },
  monitoring: {
    defaultIntervalMinutes: 60,
    staleReadingThresholdMinutes: 120, // Flag readings older than 2 hours as stale
  },
};

export type SeverityColor = 'green' | 'yellow' | 'red';

/**
 * Deterministically evaluate AQI level
 */
export function evaluateAqiSeverity(aqi: number): SeverityColor {
  if (aqi >= CENTRAL_THRESHOLDS.aqi.dangerThreshold) return 'red';
  if (aqi >= CENTRAL_THRESHOLDS.aqi.warningThreshold) return 'yellow';
  return 'green';
}

/**
 * Deterministically evaluate Temperature level
 */
export function evaluateTemperatureSeverity(tempCelsius: number): SeverityColor {
  if (tempCelsius >= CENTRAL_THRESHOLDS.temperature.dangerThresholdCelsius) return 'red';
  if (tempCelsius >= CENTRAL_THRESHOLDS.temperature.warningThresholdCelsius) return 'yellow';
  return 'green';
}

/**
 * Deterministically evaluate Flooding level
 * Combines instrument readings with community survey evidence
 */
export function evaluateFloodingSeverity(
  precipProb: number,
  rain24hMm: number,
  recentCorroboratingSurveysCount: number
): {
  level: SeverityColor;
  computedRiskPercent: number;
  sourceExplanation: string;
  isCommunityCorroborated: boolean;
} {
  const { flooding } = CENTRAL_THRESHOLDS;
  const isCommunityCorroborated = recentCorroboratingSurveysCount >= flooding.minSurveyReportsForCommunityFlood;

  // Base instrument risk
  let instrumentDanger = precipProb >= flooding.dangerPrecipProbPercent || rain24hMm >= flooding.dangerRain24hMm;
  let instrumentWarning = precipProb >= flooding.warningPrecipProbPercent || rain24hMm >= flooding.warningRain24hMm;

  // Calculate estimated risk index (0 - 100)
  let riskPercent = Math.min(100, Math.round(precipProb * 0.6 + (rain24hMm / 30) * 40));

  if (instrumentDanger) {
    const explanation = isCommunityCorroborated
      ? `Critical flood warning: ${rain24hMm}mm rainfall confirmed by ${recentCorroboratingSurveysCount} citizen reports.`
      : `High precipitation warning: ${precipProb}% storm chance with ${rain24hMm}mm accumulation forecast.`;
    return {
      level: 'red',
      computedRiskPercent: Math.max(75, riskPercent),
      sourceExplanation: explanation,
      isCommunityCorroborated,
    };
  }

  // If community reports corroborate flooding even with moderate rain:
  if (isCommunityCorroborated) {
    return {
      level: 'yellow',
      computedRiskPercent: Math.max(50, riskPercent),
      sourceExplanation: `Waterlogging advisory: ${recentCorroboratingSurveysCount} independent community reports in past 3h.`,
      isCommunityCorroborated: true,
    };
  }

  if (instrumentWarning) {
    return {
      level: 'yellow',
      computedRiskPercent: Math.max(35, riskPercent),
      sourceExplanation: `Runoff watch: ${precipProb}% rain probability and ${rain24hMm}mm accumulation.`,
      isCommunityCorroborated: false,
    };
  }

  return {
    level: 'green',
    computedRiskPercent: Math.max(10, riskPercent),
    sourceExplanation: `Normal drainage: Clear flow conditions with ${precipProb}% precipitation risk.`,
    isCommunityCorroborated: false,
  };
}
