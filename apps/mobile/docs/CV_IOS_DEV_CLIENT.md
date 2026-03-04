# Atlas iOS Native Pose Provider (Expo Dev Client)

## Current repo state
- iOS native scaffold generated via:
  - `npx expo prebuild -p ios`
- Result captured:
  - `✔ Finished prebuild`
- Native bridge files landed:
  - `ios/PTAdherence/AtlasPoseModule.swift`
  - `ios/PTAdherence/AtlasPoseModule.m`

## Prereqs
- Xcode + iOS Simulator
- CocoaPods (`sudo gem install cocoapods` if missing)
- Expo CLI in repo (`npx expo`)

## 1) Install deps
```bash
cd apps/mobile
npm install
```

## 2) (If ios/ missing) generate native iOS project
```bash
npx expo prebuild -p ios
```

## 3) Native module contract (must match JS guard)
`AtlasPoseModule` exposes:
- `isAvailable() -> Promise<boolean>`
- `estimatePose({ base64, width, height, timestampMs }) -> Promise<{ confidence:number, landmarks:Array<{ index?:number, name?:string, x:number, y:number, z?:number, visibility?:number }> }>`

Native error codes (mapped to provider taxonomy):
- `CAMERA_DENIED`
- `SESSION_INTERRUPTED`
- `MODULE_MISSING`

## 4) Build dev client (iOS)
```bash
npx expo run:ios
```

## 5) Start Metro for dev client
```bash
npx expo start --dev-client
```

## 6) Verify in app
1. Open Session tab
2. Provider health should show: `Pose provider: READY`
3. Debug panel should show: `NONE`
4. Start session and confirm confidence/reps update

## Failure diagnostics
- `UNAVAILABLE` + `MODULE_MISSING` => bridge missing/not exported.
- `ERROR` + `BAD_PAYLOAD_SHAPE` => malformed `estimatePose` return.
- `ERROR` + `BAD_LANDMARKS` => no mapped landmarks from native joints.
- `ERROR` + `BAD_TIMESTAMP` => stale/invalid frame timestamp.
- `ERROR` + `CAMERA_DENIED` => camera permission denied at native layer.
- `ERROR` + `SESSION_INTERRUPTED` => app/camera session interruption.
