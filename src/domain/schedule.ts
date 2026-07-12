export const scheduleEventStatuses = ["active", "cancelled"] as const;
export type ScheduleEventStatus = (typeof scheduleEventStatuses)[number];

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
  discordChannelId: string;
  startsAtFrom: Date;
  startsAtTo: Date;
  status?: ScheduleEventStatus;
}
