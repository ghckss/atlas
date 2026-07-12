import type { ScheduleEvent, ScheduleEventDraft, ScheduleEventRange } from "../../domain";

export interface ScheduleRepository {
  createEvent(draft: ScheduleEventDraft): Promise<ScheduleEvent>;
  listEvents(range: ScheduleEventRange): Promise<readonly ScheduleEvent[]>;
}
