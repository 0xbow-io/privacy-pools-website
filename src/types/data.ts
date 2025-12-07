import { HistoryData, AllEventsResponse, GlobalEventsResponse } from '~/types';

export type ActivityRecords = HistoryData | AllEventsResponse['events'] | GlobalEventsResponse['events'];
