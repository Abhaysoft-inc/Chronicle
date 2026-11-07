/** Where the page viewer should look. Set by "Show on page" buttons elsewhere in the app. */
export interface ViewerTarget {
  documentId: string;
  page: number;
  /** Blocks to highlight (the evidence an event cites). */
  blockIds: string[];
}
