import React from 'react';
import { AlertOctagon, Clock, ShieldAlert, History, CheckCircle2 } from 'lucide-react';

export interface EventItem {
  id: string;
  zone_id: string;
  type: 'aqi' | 'temperature' | 'flooding';
  level: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  last_alert_at: string;
}

interface EventsSectionProps {
  events: EventItem[];
  zones: Array<{ zone_id: string; name: string }>;
  loading?: boolean;
}

export const EventsSection: React.FC<EventsSectionProps> = ({ events, zones, loading }) => {
  const getZoneName = (zoneId: string) => {
    return zones.find((z) => z.zone_id === zoneId)?.name || zoneId;
  };

  const formatMetricName = (type: string) => {
    if (type === 'aqi') return 'Air Quality Hazard (Severe AQI)';
    if (type === 'temperature') return 'Extreme Temperature Hazard';
    if (type === 'flooding') return 'Critical Flood / Drainage Surge';
    return type.toUpperCase();
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <History className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            Hazard Incident History (Events)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Immutable log of dangerous environmental transitions triggered when conditions exceeded safety limits.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <ShieldAlert className="h-3 w-3 text-slate-500" />
          <span>{events.length} Recorded Transition{events.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Loading historical incident logs...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50 py-7 text-center dark:border-slate-800 dark:bg-slate-950/20">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              No Dangerous Incident Transitions Recorded
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mt-0.5">
              All monitored areas are evaluated on each cycle. When a metric transitions from safe to dangerous, an immutable event record is preserved here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto pr-1">
            {events.map((ev) => (
              <div key={ev.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
                    <AlertOctagon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {formatMetricName(ev.type)}
                      </span>
                      <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-800 uppercase dark:bg-rose-950 dark:text-rose-300">
                        {ev.level}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Area: <span className="font-medium text-slate-800 dark:text-slate-200">{getZoneName(ev.zone_id)}</span>
                    </p>
                  </div>
                </div>

                <div className="sm:text-right text-xs text-slate-500 dark:text-slate-400 flex sm:flex-col items-center sm:items-end justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <Clock className="h-3 w-3" />
                    {new Date(ev.opened_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ID: {ev.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
