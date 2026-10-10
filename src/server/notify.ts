export interface AlertEvent {
  id?: string;
  zone_id: string;
  type: string;
  level: string;
  status?: string;
  opened_at?: string;
  closed_at?: string | null;
  last_alert_at?: string;
  green_checks?: number;
  [key: string]: any;
}

/**
 * Placeholder notification dispatcher for environmental alerts.
 * Currently logs the event to stdout and returns.
 * Called once when an event is first opened (never on updates).
 */
export async function notifyResidents(event: AlertEvent): Promise<void> {
  console.log(`ALERT ${event.zone_id} ${event.type} ${event.level}`);
}
