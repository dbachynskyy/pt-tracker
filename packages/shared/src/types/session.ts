export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export interface ExerciseLog {
  exerciseName: string;
  setsDone: number;
  repsDone: number;
}

export interface ExerciseSession {
  id: string;
  userId: string;
  planId: string | null;
  status: SessionStatus;
  exercisesCompleted: ExerciseLog[];
  notes: string | null;
  painLevel: number | null;
  createdAt: string;
}
