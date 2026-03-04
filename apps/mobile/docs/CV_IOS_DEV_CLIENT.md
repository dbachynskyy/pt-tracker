# Atlas iOS Native Pose Provider (Expo Dev Client)

## Prereqs
- Xcode + iOS Simulator
- CocoaPods (`sudo gem install cocoapods` if missing)
- Expo CLI in repo (`npx expo`)

## 1) Install deps
```bash
cd apps/mobile
npm install
```

## 2) Generate native iOS project (first time / after native changes)
```bash
npx expo prebuild -p ios
```

## 3) Implement native module contract in iOS target
Create/verify `AtlasPoseModule` exposing:
- `isAvailable() -> Promise<boolean>`
- `estimatePose({ base64, width, height, timestampMs }) -> Promise<{ confidence:number, landmarks:Array<{ index?:number, name?:string, x:number, y:number, z?:number, visibility?:number }> }>`

Error codes to throw for contract parity:
- `CAMERA_DENIED`
- `SESSION_INTERRUPTED`
- `MODULE_MISSING`

## 4) Build dev client
```bash
npx expo run:ios
```

## 5) Start Metro for dev client
```bash
npx expo start --dev-client
```

## 6) Verify in app
1. Open Session tab
2. Confirm provider health line shows `Pose provider: READY`
3. Confirm debug line (`provider-last-error`) shows `NONE`
4. Start session and ensure reps/confidence update

## Failure diagnostics
If provider not live:
- `Pose provider: UNAVAILABLE` + `MODULE_MISSING` => native module not linked/exported.
- `Pose provider: ERROR` + `BAD_PAYLOAD_SHAPE` => malformed return from `estimatePose`.
- `Pose provider: ERROR` + `BAD_LANDMARKS` => landmark names/indexes do not map to Atlas schema.
- `Pose provider: ERROR` + `BAD_TIMESTAMP` => stale/invalid frame timestamp crossing JS guard window.
- `Pose provider: ERROR` + `CAMERA_DENIED` => iOS camera permission rejected at native layer.
- `Pose provider: ERROR` + `SESSION_INTERRUPTED` => AV capture session interruption.
