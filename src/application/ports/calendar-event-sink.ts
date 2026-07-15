export type CalendarEventProvider = "google";

export interface CalendarEventDraft {
  sourceId: string;
  title: string;
  startsAt: Date;
  timezone: string;
  notes?: string;
}

export interface CreatedCalendarEvent {
  provider: CalendarEventProvider;
  externalEventId: string;
  url?: string;
}

export interface CalendarEventSink {
  createEvent(draft: CalendarEventDraft): Promise<CreatedCalendarEvent>;
}
