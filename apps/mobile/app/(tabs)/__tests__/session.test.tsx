import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }), {
  virtual: true,
});

let mockPermissionGranted = true;
const mockRequestPermissionMock = jest.fn().mockResolvedValue({ status: 'granted', granted: true });

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Camera: {
      requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
    },
    CameraView: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: jest.fn().mockResolvedValue({ width: 200, height: 300, base64: 'x' }),
      }));
      return React.createElement(View, props);
    }),
    PermissionStatus: { GRANTED: 'granted' },
    useCameraPermissions: () => [{ granted: mockPermissionGranted, status: mockPermissionGranted ? 'granted' : 'denied' }, mockRequestPermissionMock],
  };
});

jest.mock('../../../src/api/client', () => ({
  api: {
    createSession: jest.fn(),
    completeSession: jest.fn(),
  },
}));

let mockProviderStatus: 'idle' | 'ready' | 'unavailable' | 'error' = 'ready';
let mockProviderErrorCode: string | undefined;
let mockProviderErrorReason: string | undefined;

jest.mock('../../../src/cv/poseProvider', () => ({
  getPoseProviderState: () => ({
    status: mockProviderStatus,
    providerId: 'test',
    errorCode: mockProviderErrorCode,
    error: mockProviderErrorReason,
  }),
}));

let latestOnFrame: ((o: import('../../../src/cv/types').DetectorOutput) => void) | null = null;
const mockStop = jest.fn();

jest.mock('../../../src/cv/mockDetector', () => ({
  createDetector: (type: string) => ({
    exerciseType: type,
    start: (cb: (o: import('../../../src/cv/types').DetectorOutput) => void) => {
      latestOnFrame = cb;
    },
    stop: mockStop,
    reset: jest.fn(),
  }),
  isMockCvEnabled: () => true,
}));

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

describe('SessionScreen CV integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestOnFrame = null;
    mockPermissionGranted = true;
    mockProviderStatus = 'ready';
    mockProviderErrorCode = undefined;
    mockProviderErrorReason = undefined;
    mockRequestPermissionMock.mockResolvedValue({ status: 'granted', granted: true });
    mockApi.createSession.mockResolvedValue(makeSession() as any);
    mockApi.completeSession.mockResolvedValue({ ...makeSession(), status: 'completed' } as any);
  });

  it('renders exercise selector and start button in idle phase', () => {
    const { getByTestId } = render(<SessionScreen />);
    expect(getByTestId('exercise-option-squat')).toBeTruthy();
    expect(getByTestId('start-session-btn')).toBeTruthy();
    expect(String(getByTestId('provider-health-status').props.children)).toContain('READY');
    expect(String(getByTestId('provider-last-error').props.children)).toContain('NONE');
  });

  it('shows provider unavailable state', async () => {
    mockProviderStatus = 'unavailable';
    mockProviderErrorCode = 'MODULE_MISSING';
    mockProviderErrorReason = 'module missing';
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });

    expect(getByTestId('provider-unavailable')).toBeTruthy();
    expect(String(getByTestId('provider-last-error').props.children)).toContain('MODULE_MISSING');
  });

  it('shows provider malformed state when provider status=error', async () => {
    mockProviderStatus = 'error';
    mockProviderErrorCode = 'BAD_LANDMARKS';
    mockProviderErrorReason = 'mapped landmarks too sparse';
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });

    expect(getByTestId('provider-malformed')).toBeTruthy();
    expect(String(getByTestId('provider-last-error').props.children)).toContain('BAD_LANDMARKS');
  });

  it('shows permission denied state', async () => {
    mockPermissionGranted = false;
    mockRequestPermissionMock.mockResolvedValue({ status: 'denied', granted: false });
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });

    expect(getByTestId('permission-denied')).toBeTruthy();
  });

  it('shows low confidence warning when confidence is below threshold', async () => {
    const { getByTestId } = render(<SessionScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('start-session-btn'));
    });
    await waitFor(() => expect(getByTestId('complete-session-btn')).toBeTruthy());

    act(() => {
      latestOnFrame!(makeOutput({ confidence: 0.2 }));
    });

    expect(getByTestId('low-confidence-warning')).toBeTruthy();
  });
});
