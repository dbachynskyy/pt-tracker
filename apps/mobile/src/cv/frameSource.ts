import { CameraCapturedPicture, CameraView } from 'expo-camera';
import { RefObject } from 'react';
import { CameraFrame, FrameSource } from './types';

let registeredSource: FrameSource | null = null;

export function registerFrameSource(source: FrameSource | null) {
  registeredSource = source;
}

export function getFrameSource(): FrameSource | null {
  return registeredSource;
}

export function createExpoCameraFrameSource(cameraRef: RefObject<CameraView | null>): FrameSource {
  return {
    async readFrame() {
      if (!cameraRef.current) return null;
      const snap = (await cameraRef.current.takePictureAsync({
        quality: 0.25,
        base64: true,
        skipProcessing: true,
      })) as CameraCapturedPicture;

      if (!snap.base64) return null;

      return {
        width: snap.width,
        height: snap.height,
        base64: snap.base64,
        timestampMs: Date.now(),
      } as CameraFrame;
    },
  };
}
