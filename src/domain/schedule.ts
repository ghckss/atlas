export const scheduleEventStatuses = ["active", "cancelled"] as const;
export type ScheduleEventStatus = (typeof scheduleEventStatuses)[number];
export type ScheduleExternalCalendarProvider = "google";

export interface ScheduleEvent {
  id: string;
  ownerUserId: string;
  discordGuildId?: string;
  discordChannelId: string;
  title: string;
  startsAt: Date;
  timezone: string;
  notes?: string;
  status: ScheduleEventStatus;
  externalCalendarProvider?: ScheduleExternalCalendarProvider;
  externalCalendarEventId?: string;
  externalCalendarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleEventDraft {
  ownerUserId: string;
  discordGuildId?: string;
  discordChannelId: string;
  title: string;
  startsAt: Date;
  timezone: string;
  notes?: string;
}

export interface ScheduleEventRange {
  discordGuildId?: string;
  discordChannelId?: string;
  startsAtFrom: Date;
  startsAtTo: Date;
  status?: ScheduleEventStatus;
}

export interface ScheduleExternalCalendarLink {
  provider: ScheduleExternalCalendarProvider;
  externalEventId: string;
  url?: string;
}
