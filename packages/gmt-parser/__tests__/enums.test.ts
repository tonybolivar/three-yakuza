import { describe, it, expect } from 'vitest';
import { GMTVersion, GMTCurveType, GMTCurveChannel, GMTCurveFormat } from '../src/enums.js';

describe('GMTVersion', () => {
  it('has correct numeric values', () => {
    expect(GMTVersion.KENZAN).toBe(0x10001);
    expect(GMTVersion.YAKUZA3).toBe(0x20000);
    expect(GMTVersion.YAKUZA5).toBe(0x20001);
    expect(GMTVersion.ISHIN).toBe(0x20002);
  });
});

describe('GMTCurveType', () => {
  it('has correct values', () => {
    expect(GMTCurveType.ROTATION).toBe(0);
    expect(GMTCurveType.LOCATION).toBe(1);
    expect(GMTCurveType.PATTERN_HAND).toBe(4);
    expect(GMTCurveType.PATTERN_UNK).toBe(5);
    expect(GMTCurveType.PATTERN_FACE).toBe(6);
  });
});

describe('GMTCurveChannel', () => {
  it('has correct values', () => {
    expect(GMTCurveChannel.ALL).toBe(0);
    expect(GMTCurveChannel.X).toBe(1);
    expect(GMTCurveChannel.Y).toBe(2);
    expect(GMTCurveChannel.ZW).toBe(3);
    expect(GMTCurveChannel.Z).toBe(4);
  });
});

describe('GMTCurveFormat', () => {
  it('has correct hex values', () => {
    expect(GMTCurveFormat.ROT_QUAT_XYZ_FLOAT).toBe(0x01);
    expect(GMTCurveFormat.ROT_XYZW_SHORT).toBe(0x02);
    expect(GMTCurveFormat.LOC_CHANNEL).toBe(0x04);
    expect(GMTCurveFormat.LOC_XYZ).toBe(0x06);
    expect(GMTCurveFormat.ROT_XW_FLOAT).toBe(0x10);
    expect(GMTCurveFormat.ROT_YW_FLOAT).toBe(0x11);
    expect(GMTCurveFormat.ROT_ZW_FLOAT).toBe(0x12);
    expect(GMTCurveFormat.ROT_XW_SHORT).toBe(0x13);
    expect(GMTCurveFormat.ROT_YW_SHORT).toBe(0x14);
    expect(GMTCurveFormat.ROT_ZW_SHORT).toBe(0x15);
    expect(GMTCurveFormat.PATTERN_HAND).toBe(0x1c);
    expect(GMTCurveFormat.PATTERN_UNK).toBe(0x1d);
    expect(GMTCurveFormat.ROT_QUAT_XYZ_INT).toBe(0x1e);
  });
});
