import React, { useState } from 'react';
import { Send, CheckCircle2, AlertTriangle, ShieldCheck, Loader2, MessageSquare, LogIn } from 'lucide-react';
import { UserSession } from '../types';

interface SurveysSectionProps {
  currentZoneId: string;
  zones: Array<{ zone_id: string; name: string }>;
  user: UserSession | null;
  onOpenLogin: () => void;
  onSurveySubmitted?: () => void;
}

export const SurveysSection: React.FC<SurveysSectionProps> = ({
  currentZoneId,
  zones,
  user,
  onOpenLogin,
  onSurveySubmitted,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>(currentZoneId || zones[0]?.zone_id || 'zone-academic');
  const [airQuality, setAirQuality] = useState<'normal' | 'polluted'>('normal');
  const [temperature, setTemperature] = useState<'normal' | 'hot' | 'cold'>('normal');
  const [flooding, setFlooding] = useState<'none' | 'waterlogging' | 'flooding'>('none');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync selectedZone when currentZoneId changes
  React.useEffect(() => {
    if (currentZoneId) {
      setSelectedZone(currentZoneId);
    }
  }, [currentZoneId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!user) {
      onOpenLogin();
      return;
    }

    setIsSubmitting(true);

    try {
      // Determine primary survey kind based on whether user is reporting flooding or air concern
      const primaryType: 'air' | 'flood' = flooding !== 'none' ? 'flood' : 'air';

      const structuredAnswers = {
        air_quality: airQuality === 'normal' ? 'Appears normal' : 'Appears polluted or concerning',
        temperature:
          temperature === 'normal'
            ? 'Normal'
            : temperature === 'hot'
            ? 'Unusually hot'
            : 'Unusually cold',
        flooding:
          flooding === 'none'
            ? 'No visible waterlogging'
            : flooding === 'waterlogging'
            ? 'Waterlogging'
            : 'Flooding',
        description: description.trim() || undefined,
        submitted_by_name: user.name,
      };

      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || '00000000-0000-0000-0000-000000000000',
          zoneId: selectedZone,
          type: primaryType,
          answers: structuredAnswers,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit survey');
      }

      setFeedback({
        type: 'success',
        text: 'Thank you! Your community observation has been recorded and will be factored into the next monitoring cycle.',
      });
      setDescription('');
      if (onSurveySubmitted) onSurveySubmitted();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Error submitting report. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Report Local Conditions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Community observations help corroborate flooding and validate sensor thresholds.
          </p>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Anonymous community aggregation</span>
        </div>
      </div>

      {!user ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Please log in or create an account to submit verified local environmental reports.
          </p>
          <button
            onClick={onOpenLogin}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Log In to Report</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Area Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Monitored Area
            </label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {zones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Air Quality */}
            <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Air Quality
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="airQuality"
                    value="normal"
                    checked={airQuality === 'normal'}
                    onChange={() => setAirQuality('normal')}
                    className="text-emerald-600"
                  />
                  <span>Appears normal</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="airQuality"
                    value="polluted"
                    checked={airQuality === 'polluted'}
                    onChange={() => setAirQuality('polluted')}
                    className="text-emerald-600"
                  />
                  <span>Polluted / concerning</span>
                </label>
              </div>
            </div>

            {/* Temperature */}
            <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Temperature
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="temperature"
                    value="normal"
                    checked={temperature === 'normal'}
                    onChange={() => setTemperature('normal')}
                    className="text-emerald-600"
                  />
                  <span>Normal</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="temperature"
                    value="hot"
                    checked={temperature === 'hot'}
                    onChange={() => setTemperature('hot')}
                    className="text-emerald-600"
                  />
                  <span>Unusually hot</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="temperature"
                    value="cold"
                    checked={temperature === 'cold'}
                    onChange={() => setTemperature('cold')}
                    className="text-emerald-600"
                  />
                  <span>Unusually cold</span>
                </label>
              </div>
            </div>

            {/* Flooding */}
            <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Flooding & Drainage
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="flooding"
                    value="none"
                    checked={flooding === 'none'}
                    onChange={() => setFlooding('none')}
                    className="text-emerald-600"
                  />
                  <span>No visible waterlogging</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="flooding"
                    value="waterlogging"
                    checked={flooding === 'waterlogging'}
                    onChange={() => setFlooding('waterlogging')}
                    className="text-emerald-600"
                  />
                  <span>Waterlogging</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    name="flooding"
                    value="flooding"
                    checked={flooding === 'flooding'}
                    onChange={() => setFlooding('flooding')}
                    className="text-emerald-600"
                  />
                  <span>Severe flooding</span>
                </label>
              </div>
            </div>
          </div>

          {/* Short description */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Short Description / Specific Landmark (Optional, max 140 chars)
            </label>
            <input
              type="text"
              maxLength={140}
              placeholder="e.g. Water pooling near gate 2 underpass or heavy dust cloud"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3 w-3" />
                  <span>Submit Observation</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
