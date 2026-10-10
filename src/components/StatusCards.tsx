import React from 'react';

interface StatusCardsProps {
  currentLocation: string;
}

export const StatusCards: React.FC<StatusCardsProps> = ({ currentLocation }) => {
  const metrics = [
    {
      title: 'Air Quality (AQI)',
      value: '145',
      severity: 'Moderate',
      statusColor: 'bg-amber-100 text-amber-800 border-amber-300',
      dotColor: 'bg-amber-500',
    },
    {
      title: 'Temperature',
      value: '34°C',
      severity: 'Moderate',
      statusColor: 'bg-amber-100 text-amber-800 border-amber-300',
      dotColor: 'bg-amber-500',
    },
    {
      title: 'Flooding Risk',
      value: 'Moderate',
      severity: 'Moderate',
      statusColor: 'bg-amber-100 text-amber-800 border-amber-300',
      dotColor: 'bg-amber-500',
    },
  ];

  return (
    <div className="space-y-2">
      {/* 3 Compact Metric Cards in one horizontal row on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <div className="text-xs font-medium text-slate-500">
                {item.title}
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {item.value}
              </div>
            </div>

            {/* Small severity indicator badge */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${item.statusColor}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
              <span>{item.severity}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Clear Demonstration Data Notice */}
      <p className="text-center text-xs text-slate-500 pt-1">
        * Simulated demonstration data for {currentLocation}. Not live sensor readings.
      </p>
    </div>
  );
};
