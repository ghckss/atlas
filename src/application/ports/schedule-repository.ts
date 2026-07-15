import type {
  ScheduleEvent,
  ScheduleEventDraft,
  ScheduleEventRange,
  ScheduleExternalCalendarLink
} from "../../domain";

export interface ScheduleRepository {
  createEvent(draft: ScheduleEventDraft): Promise<ScheduleEvent>;
  attachExternalCalendarEvent(
    id: string,
    link: ScheduleExternalCalendarLink
  ): Promise<ScheduleEvent>;
  listEvents(range: ScheduleEventRange): Promise<readonly ScheduleEvent[]>;
}
