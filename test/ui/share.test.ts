import {
  decodeProgramFromHash,
  encodeProgramToHash,
  isProgramHash,
} from '../../src/ui/share';
import { SAMPLES } from '../../src/samples';

describe('share fragment encoding', () => {
  it('round-trips every sample program', () => {
    for (const sample of SAMPLES) {
      const hash = encodeProgramToHash(sample.source);
      expect(decodeProgramFromHash(hash)).toBe(sample.source);
    }
  });

  it('round-trips non-ASCII and special characters', () => {
    const source = 'fn main() {\n    let héllo_ünïcode = 1; // ✓→\n}\n';
    expect(decodeProgramFromHash(encodeProgramToHash(source))).toBe(source);
  });

  it('produces a URL-safe fragment', () => {
    const hash = encodeProgramToHash('fn main() { helper(63, 62); }???>>>');
    expect(hash).toMatch(/^#program=[A-Za-z0-9_-]+$/);
    expect(isProgramHash(hash)).toBe(true);
  });

  it('rejects hashes without the program prefix', () => {
    expect(decodeProgramFromHash('')).toBeNull();
    expect(decodeProgramFromHash('#')).toBeNull();
    expect(decodeProgramFromHash('#section-2')).toBeNull();
    expect(decodeProgramFromHash('#code=Zm4=')).toBeNull();
  });

  it('rejects malformed base64 payloads', () => {
    expect(decodeProgramFromHash('#program=%%%')).toBeNull();
    expect(decodeProgramFromHash('#program=not base64!')).toBeNull();
  });

  it('rejects payloads that are not valid UTF-8', () => {
    expect(decodeProgramFromHash('#program=' + btoa('\xff\xfe'))).toBeNull();
  });
});
