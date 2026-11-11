import { type ContexteExtrasIA } from '../../utils/promptAssistant';

export interface AssistantLog {
  id: string;
  question: string;
  reponse: string;
  patient_id: string | null;
  created_at: string;
}

export interface PatientExtras extends ContexteExtrasIA {
  loading: boolean;
}
