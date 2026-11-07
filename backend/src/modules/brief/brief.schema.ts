export interface BriefSection {
  title: string;
  content: string;
}

export interface Brief {
  id: string;
  case_id: string;
  title: string;
  content_md: string;
  sections: {
    snapshot: string;
    records_reviewed: string;
    chronology: string;
    issues_for_opinion: string;
    questions_for_expert: string;
    limits: string;
  };
  output_language: string;
  created_at: string;
  updated_at: string;
}
