const BASE_URL = (
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8000'
).replace(/\/$/, '');

// ── Shared types (mirrored from packages/shared) ──────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface ExerciseSpec {
  name: string;
  sets: number;
  reps: number;
  hold_seconds: number;
  notes?: string | null;
}

export interface Plan {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  exercises: ExerciseSpec[];
  sessions_per_week: number;
  created_at: string;
}

export interface ExerciseLog {
  exercise_name: string;
  sets_done: number;
  reps_done: number;
}

export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export interface Session {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: SessionStatus;
  exercises_completed: ExerciseLog[];
  notes: string | null;
  pain_level: number | null;
  created_at: string;
}

export interface CreateSessionBody {
  plan_id?: string | null;
  exercises_completed?: ExerciseLog[];
  notes?: string | null;
  pain_level?: number | null;
}

export interface SessionsPage {
  items: Session[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface SessionsFilter {
  page?: number;
  page_size?: number;
  exercise_type?: string;
  date?: string;
}

export interface AdherenceSummary {
  streak_days: number;
  completed_7d: number;
  completed_30d: number;
  total_completed: number;
  total_sessions: number;
}

// ── API client ────────────────────────────────────────────────────────────

class ApiClient {
  private token: string | null = null;

  setToken(t: string | null) {
    this.token = t;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  login(email: string, password: string) {
    return this.request<AuthTokens>('POST', '/auth/login', { email, password });
  }

  register(email: string, password: string, full_name?: string) {
    return this.request<User>('POST', '/users/register', { email, password, full_name });
  }

  me() {
    return this.request<User>('GET', '/users/me');
  }

  listPlans() {
    return this.request<Plan[]>('GET', '/plans/');
  }

  createSession(body: CreateSessionBody = {}) {
    return this.request<Session>('POST', '/sessions/', body);
  }

  listSessions(params?: SessionsFilter) {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', String(params.page));
    if (params?.page_size != null) qs.set('page_size', String(params.page_size));
    if (params?.exercise_type) qs.set('exercise_type', params.exercise_type);
    if (params?.date) qs.set('date', params.date);
    const q = qs.toString();
    return this.request<SessionsPage>('GET', `/sessions/${q ? `?${q}` : ''}`);
  }

  completeSession(id: string) {
    return this.request<Session>('PATCH', `/sessions/${id}/complete`);
  }

  getAdherenceSummary() {
    return this.request<AdherenceSummary>('GET', '/sessions/summary');
  }
}

export const api = new ApiClient();
