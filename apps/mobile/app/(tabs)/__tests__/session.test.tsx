/**
 * Session screen — CV integration flow tests.
 *
 * API calls and the detector are mocked so no real network or timers needed.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock expo-router (not installed in test environment)
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }), {
  virtual: true,
});

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  },
  PermissionStatus: { GRANTED: 'granted' },
  useCameraPermissions: () => [{ granted: true, status: 'granted' }, jest.fn().mockResolvedValue({ status: 'granted', granted: true })],
}));

// Mock the API client
jest.mock('../../../src/api/client', () => ({
  api: {
    createSession: jest.fn(),
    completeSession: jest.fn(),
  },
}));

// Capture detector callbacks so tests can drive output manually.
let latestOnFrame: ((o: import('../../../src/cv/types').DetectorOutput) => void) | null = null;
const mockStop = jest.fn();
const mockReset = jest.fn();

jest.mock('../../../src/cv/mockDetector', () => ({
  createDetector: (type: string) => ({
    exerciseType: type,
    start: (cb: (o: import('../../../src/cv/types').DetectorOutput) => void) => {
      latestOnFrame = cb;
    },
    stop: mockStop,
    reset: mockReset,
  }),
  isMockCvEnabled: () => true,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { api } from '../../../src/api/client';
import { DetectorOutput } from '../../../src/cv/types';
import SessionScreen from '../session';

const mockApi = api as jest.Mocked<typeof api>;

function makeSession(id = 'sess-1234') {
  return { id, user_id: 'u1', plan_id: null, status: 'in_progress', exercises_completed: [], notes: null, pain_level: null, created_at: new Date().toISOString() };
}

function makeOutput(overrides: Partial<DetectorOutput> = {}): DetectorOutput {
  return {
    exerciseType: 'squat',
    repCount: 3,
    formScore: 90,
    confidence: 0.95,
    flags: [],
    reps: [],
    elapsedMs: 6000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionScreen CV integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestOnFrame = null;
    mockApi.createSession.mockResolvedValue(makeSession() as any);
    mockApi.completeSession.mockResolvedValue({ ...makeSession(), status: 'completed' } as any);
  });

  it('renders exercise selector and start button in idle phase', () => {
    const { getByTestId, getByText } = render(<SessionScreen />);
    expect(getByTestId('exercise-option-squat')).toBeTruthy();
    expect(getByTestId('exercise-option-plank')).toBeTruthy();
    expect(getByTestId('start-session-btn')).toBeTruthy();
    expect(getByText('Start Session')).toBeTruthy();
  });

  it('transitions to active phase after start and shows detector-waiting spinner', async () => {
    const { getByTestId, queryByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });

    await waitFor(() => {
      expect(getByTestId('complete-session-btn')).toBeTruthy();
    });
    // No detector output yet → show waiting spinner
    expect(getByTestId('detector-waiting')).toBeTruthy();
    // CV stats card not yet rendered
    expect(queryByTestId('cv-stats-card')).toBeNull();
  });

  it('shows CVStatsCard once detector emits output', async () => {
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    // Simulate detector frame
    act(() => {
      latestOnFrame!(makeOutput({ repCount: 2 }));
    });

    expect(getByTestId('cv-stats-card')).toBeTruthy();
    expect(getByTestId('rep-count-block')).toBeTruthy();
  });

  it('stops detector and transitions to done on complete', async () => {
    const { getByTestId, getByText } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    act(() => { latestOnFrame!(makeOutput({ repCount: 5 })); });

    await act(async () => {
      fireEvent.press(getByTestId('complete-session-btn'));
    });

    await waitFor(() => {
      expect(getByText('Session complete!')).toBeTruthy();
    });
    expect(mockStop).toHaveBeenCalled();
  });

  it('shows final CVStatsCard in done phase', async () => {
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    act(() => { latestOnFrame!(makeOutput({ repCount: 8 })); });

    await act(async () => {
      fireEvent.press(getByTestId('complete-session-btn'));
    });

    await waitFor(() => expect(getByTestId('start-another-btn')).toBeTruthy());
    expect(getByTestId('cv-stats-card')).toBeTruthy();
  });

  it('returns to idle when Start Another is pressed', async () => {
    const { getByTestId, getByText } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByTestId('complete-session-btn'));
    });
    await waitFor(() => expect(getByTestId('start-another-btn')).toBeTruthy());

    fireEvent.press(getByTestId('start-another-btn'));
    expect(getByTestId('start-session-btn')).toBeTruthy();
    expect(getByText('Start Session')).toBeTruthy();
  });

  it('uses the selected exercise type when starting the detector', async () => {
    const { getByTestId } = render(<SessionScreen />);

    // Select 'plank'
    fireEvent.press(getByTestId('exercise-option-plank'));

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    // Simulate detector frame for plank
    act(() => {
      latestOnFrame!(makeOutput({ exerciseType: 'plank', repCount: 0, elapsedMs: 20000 }));
    });

    // Plank shows hold-time block
    expect(getByTestId('hold-time-block')).toBeTruthy();
  });

  it('selector is not rendered during active phase', async () => {
    const { getByTestId, queryByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    // Exercise selector chips should be gone during active phase
    expect(queryByTestId('exercise-option-squat')).toBeNull();
  });
});
