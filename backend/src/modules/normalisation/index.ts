// Normalisation module (pipeline stage after verification): sortable dates for every event,
// inherited page dates, and duplicate events linked to their first copy.
export { caseDateContext, normaliseCase, similarity } from './normalisation.service.ts';
export { addDays, parseRawDate, type ParsedDate } from './dates.ts';
