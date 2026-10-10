// Source: Google Maps Platform Code Assist
export interface AirQualityData {
  aqi: number;
  category: string;
  dominantPollutant: string;
  displayName: string;
  healthRecommendation?: string;
  pm25?: number;
  pm10?: number;
  isLive: boolean;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  condition: string;
  iconUri?: string;
  relativeHumidity: number;
  precipitationProbability: number;
  windSpeed: number;
  windDirection: string;
  rainAccumulation24h: number;
  thunderstormProbability: number;
  isLive: boolean;
}

export interface FloodRiskData {
  riskLevel: 'Low' | 'Moderate' | 'High';
  status: string;
  description: string;
  precipitationProb: number;
  rain24h: number;
}

const API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  'AIzaSyBu5VJGo-eqvo-7ONsVBMrOVXoRgENDCx4';

const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export async function fetchAirQuality(
  lat: number,
  lng: number
): Promise<AirQualityData> {
  try {
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
      },
      body: JSON.stringify({
        location: { latitude: lat, longitude: lng },
        extraComputations: [
          'HEALTH_RECOMMENDATIONS',
          'DOMINANT_POLLUTANT_CONCENTRATION',
          'POLLUTANT_CONCENTRATION',
          'LOCAL_AQI',
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Air Quality API error: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Check for India NAQI (ind_cpcb) or fallback to Universal AQI (uaqi)
    const indIndex = data.indexes?.find((i: any) => i.code === 'ind_cpcb');
    const uaqiIndex = data.indexes?.find((i: any) => i.code === 'uaqi');
    const activeIndex = indIndex || uaqiIndex || data.indexes?.[0];

    const pm25Pollutant = data.pollutants?.find((p: any) => p.code === 'pm25');
    const pm10Pollutant = data.pollutants?.find((p: any) => p.code === 'pm10');

    return {
      aqi: activeIndex?.aqi ?? 125,
      category: activeIndex?.category ?? 'Moderate air quality',
      dominantPollutant: (activeIndex?.dominantPollutant || 'pm10').toUpperCase(),
      displayName: activeIndex?.displayName ?? 'NAQI (IN)',
      healthRecommendation: data.healthRecommendations?.generalPopulation,
      pm25: pm25Pollutant?.concentration?.value,
      pm10: pm10Pollutant?.concentration?.value,
      isLive: true,
    };
  } catch (error) {
    console.warn('[Air Quality API Fallback]', error);
    // Baseline fallback for DTU
    return {
      aqi: 125,
      category: 'Moderate air quality',
      dominantPollutant: 'PM10',
      displayName: 'NAQI (IN)',
      healthRecommendation:
        'Air quality is acceptable; however, sensitive individuals may experience minor breathing discomfort.',
      pm25: 67.2,
      pm10: 171.2,
      isLive: false,
    };
  }
}

export async function fetchWeatherData(
  lat: number,
  lng: number
): Promise<WeatherData> {
  try {
    const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lng}&solution_id=${ATTRIBUTION_ID}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
      },
    });

    if (!res.ok) {
      throw new Error(`Weather API error: ${res.statusText}`);
    }

    const data = await res.json();

    const temp = Math.round((data.temperature?.degrees ?? 30.3) * 10) / 10;
    const feelsLike = Math.round((data.feelsLikeTemperature?.degrees ?? 33.6) * 10) / 10;
    const condition = data.weatherCondition?.description?.text ?? 'Mostly sunny';
    const iconUri = data.weatherCondition?.iconBaseUri;
    const humidity = data.relativeHumidity ?? 59;
    const precipProb = data.precipitation?.probability?.percent ?? 13;
    const windSpeed = Math.round(data.wind?.speed?.value ?? 11);
    const windDir = data.wind?.direction?.cardinal ?? 'East';
    const rain24h = data.currentConditionsHistory?.qpf?.quantity ?? 0.36;
    const thunderProb = data.thunderstormProbability ?? 32;

    return {
      temperature: temp,
      feelsLike,
      condition,
      iconUri,
      relativeHumidity: humidity,
      precipitationProbability: precipProb,
      windSpeed,
      windDirection: windDir,
      rainAccumulation24h: rain24h,
      thunderstormProbability: thunderProb,
      isLive: true,
    };
  } catch (error) {
    console.warn('[Weather API Fallback]', error);
    return {
      temperature: 30.3,
      feelsLike: 33.6,
      condition: 'Mostly sunny',
      relativeHumidity: 59,
      precipitationProbability: 13,
      windSpeed: 11,
      windDirection: 'East',
      rainAccumulation24h: 0.36,
      thunderstormProbability: 32,
      isLive: false,
    };
  }
}

export function computeFloodRisk(weather: WeatherData): FloodRiskData {
  if (weather.precipitationProbability > 65 || weather.rainAccumulation24h > 25) {
    return {
      riskLevel: 'High',
      status: 'Warning',
      description: 'Heavy precipitation or storm accumulation risk in low-lying corridors.',
      precipitationProb: weather.precipitationProbability,
      rain24h: weather.rainAccumulation24h,
    };
  }

  if (weather.precipitationProbability > 30 || weather.rainAccumulation24h > 5) {
    return {
      riskLevel: 'Moderate',
      status: 'Watch Advisory',
      description: 'Localized runoff watch near storm drains and underpasses.',
      precipitationProb: weather.precipitationProbability,
      rain24h: weather.rainAccumulation24h,
    };
  }

  return {
    riskLevel: 'Low',
    status: 'Normal Drainage',
    description: `Clear drainage flow with ${weather.precipitationProbability}% precipitation probability.`,
    precipitationProb: weather.precipitationProbability,
    rain24h: weather.rainAccumulation24h,
  };
}
