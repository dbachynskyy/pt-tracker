export interface ExerciseSpec {
  name: string;
  sets: number;
  reps: number;
  holdSeconds: number;
  notes?: string;
}

export interface RehabPlan {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  exercises: ExerciseSpec[];
  sessionsPerWeek: number;
  createdAt: string;
}
