import fs from 'fs';
import path from 'path';

describe('iOS AtlasPoseModule bridge harness', () => {
  const swiftPath = path.resolve(__dirname, '../../../ios/PTAdherence/AtlasPoseModule.swift');
  const objcPath = path.resolve(__dirname, '../../../ios/PTAdherence/AtlasPoseModule.m');

  it('contains bridge files in expected location', () => {
    expect(fs.existsSync(swiftPath)).toBe(true);
    expect(fs.existsSync(objcPath)).toBe(true);
  });

  it('exports required methods and error codes', () => {
    const swift = fs.readFileSync(swiftPath, 'utf8');
    const objc = fs.readFileSync(objcPath, 'utf8');

    expect(swift).toContain('@objc(AtlasPoseModule)');
    expect(swift).toContain('func isAvailable');
    expect(swift).toContain('func estimatePose');

    expect(swift).toContain('CAMERA_DENIED');
    expect(swift).toContain('SESSION_INTERRUPTED');
    expect(swift).toContain('BAD_PAYLOAD_SHAPE');

    expect(objc).toContain('RCT_EXTERN_MODULE(AtlasPoseModule, NSObject)');
    expect(objc).toContain('RCT_EXTERN_METHOD(isAvailable');
    expect(objc).toContain('RCT_EXTERN_METHOD(estimatePose');
  });
});
