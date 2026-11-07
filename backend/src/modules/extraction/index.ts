// Extraction module (pipeline stage 3): OCR text -> events with sources, via the LLM.
export { extractCase } from './extraction.service.ts';
export { EVENT_TYPES, DOC_TYPES } from './extraction.schema.ts';
