export type LayerType = 'aqi' | 'temperature' | 'flooding';

export type SeverityLevel = 'low' | 'moderate' | 'high' | 'very-high';

export interface EnvironmentalMetric {
  id: string;
  title: string;
  value: string;
  unit: string;
  severity: SeverityLevel;
  severityLabel: string;
  description: string;
  subMetrics: { label: string; value: string }[];
  advice: string;
}

export interface MapZone {
  id: string;
  name: string;
  category: 'campus' | 'residential' | 'highway' | 'waterway' | 'greenery';
  coordinatesLabel: string;
  // SVG polygon or path coordinates
  path: string;
  center: { x: number; y: number };
  layers: {
    aqi: {
      value: number;
      label: string;
      severity: SeverityLevel;
      status: string;
      pollutantLeader: string;
    };
    temperature: {
      value: number;
      label: string;
      severity: SeverityLevel;
      status: string;
      heatIndex: string;
    };
    flooding: {
      value: number; // risk percentage or water level cm
      label: string;
      severity: SeverityLevel;
      status: string;
      drainageCapacity: string;
    };
  };
}

export interface UserSession {
  id?: string;
  name: string;
  email: string;
}

export interface ZoneStatusItem {
  zone_id: string;
  type: 'aqi' | 'temperature' | 'flooding';
  level: 'green' | 'yellow' | 'red';
  value: number;
  updated_at: string;
}

export interface MonitoredZone {
  zone_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
}

export interface LocationOption {
  id: string;
  name: string;
  area: string;
  pincode?: string;
  isPopular?: boolean;
}
