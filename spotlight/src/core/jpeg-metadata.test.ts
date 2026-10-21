import {
  assertStrippedCopy,
  findJpegMetadata,
  hasLocationMetadata,
  isMetadataFree,
  JpegFormatError,
  orientationProblem,
  stripJpegMetadata,
  type JpegErrorCode,
} from './jpeg-metadata';
import {
  adobeSegment,
  ascii,
  cameraLikeJpeg,
  commentSegment,
  concat,
  exifSegment,
  headerMarkers,
  iccSegment,
  iptcSegment,
  mpfSegment,
  scanBytes,
  segment,
  SIPS_JPEG,
  TINY_JPEG,
  withSegmentsAfterSoi,
  xmpSegment,
  type ByteOrder,
} from './testing/jpeg-fixtures';

const SOI = 0xd8;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const DQT = 0xdb;
const DHT = 0xc4;
const SOF0 = 0xc0;
const DRI = 0xdd;
const SOS = 0xda;

/** Header markers of TINY_JPEG after APP0, in file order. */
const TINY_TABLES = [SOF0, DHT, DHT, DHT, DHT, DQT, DQT, DRI, SOS];

function expectJpegShape(bytes: Uint8Array): void {
  expect([bytes[0], bytes[1]]).toEqual([0xff, SOI]);
  expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);
}

function expectFormatError(bytes: Uint8Array, code: JpegErrorCode): void {
  for (const run of [() => stripJpegMetadata(bytes), () => findJpegMetadata(bytes)]) {
    let caught: unknown;
    try {
      run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JpegFormatError);
    expect((caught as JpegFormatError).code).toBe(code);
  }
}

describe('fixtures', () => {
  it('TINY_JPEG is a clean baseline JPEG with no metadata', () => {
    expect(headerMarkers(TINY_JPEG)).toEqual([APP0, ...TINY_TABLES]);
    const report = findJpegMetadata(TINY_JPEG);
    expect(isMetadataFree(report)).toBe(true);
    expect(report).toMatchObject({ exif: false, xmp: false, gps: false, orientation: null });
  });
});

describe('findJpegMetadata', () => {
  it.each<ByteOrder>(['II', 'MM'])('finds the GPS pointer and Orientation in %s Exif', (order) => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order, gps: true, orientation: 6 }));
    const report = findJpegMetadata(jpeg);
    expect(report).toMatchObject({ exif: true, exifReadable: true, gps: true, orientation: 6 });
    expect(hasLocationMetadata(jpeg)).toBe(true);
    expect(isMetadataFree(report)).toBe(false);
  });

  it.each<ByteOrder>(['II', 'MM'])('reports %s Exif without GPS as not a location', (order) => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order, orientation: 3 }));
    expect(findJpegMetadata(jpeg)).toMatchObject({ exif: true, gps: false, orientation: 3 });
    expect(hasLocationMetadata(jpeg)).toBe(false);
  });

  it("reads a real encoder's Exif (macOS sips, big-endian) and APP13", () => {
    const report = findJpegMetadata(SIPS_JPEG);
    expect(report).toMatchObject({ exif: true, exifReadable: true, gps: false, iptc: true, orientation: null });
    expect(report.removableSegments).toBe(2);
  });

  it('treats unreadable Exif as a possible location', () => {
    const broken = segment(APP1, concat(ascii('Exif\0\0'), ascii('XX'), new Uint8Array([0, 42, 0, 0, 0, 8])));
    const pointsOutside = segment(APP1, concat(ascii('Exif\0\0MM'), new Uint8Array([0, 42, 0x7f, 0xff, 0xff, 0xff])));
    for (const exif of [broken, pointsOutside]) {
      const jpeg = withSegmentsAfterSoi(TINY_JPEG, exif);
      expect(findJpegMetadata(jpeg)).toMatchObject({ exif: true, exifReadable: false });
      expect(hasLocationMetadata(jpeg)).toBe(true);
    }
  });

  it('finds GPS coordinates in XMP', () => {
    expect(hasLocationMetadata(withSegmentsAfterSoi(TINY_JPEG, xmpSegment(true)))).toBe(true);
    const plain = withSegmentsAfterSoi(TINY_JPEG, xmpSegment(false));
    expect(findJpegMetadata(plain)).toMatchObject({ xmp: true, xmpGps: false });
    expect(hasLocationMetadata(plain)).toBe(false);
  });

  it('reports every kind of segment in a camera-like file', () => {
    expect(findJpegMetadata(cameraLikeJpeg())).toMatchObject({
      exif: true,
      gps: true,
      orientation: 6,
      xmp: true,
      xmpGps: true,
      iptc: true,
      comment: true,
      icc: true,
      adobe: false,
      removableSegments: 5, // Exif, MPF, XMP, APP13, COM
      trailingBytes: expect.any(Number),
    });
  });
});

describe('stripJpegMetadata', () => {
  it.each<ByteOrder>(['II', 'MM'])('removes %s Exif with GPS and keeps the image bytes', (order) => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order, gps: true, orientation: 1 }));
    const stripped = stripJpegMetadata(jpeg);
    expect(hasLocationMetadata(stripped)).toBe(false);
    expect(findJpegMetadata(stripped).exif).toBe(false);
    expect(stripped).toEqual(TINY_JPEG);
  });

  it('removes XMP, APP13, COM, MPF, and unknown APPn; keeps ICC, Adobe, and JFIF', () => {
    const jpeg = withSegmentsAfterSoi(
      TINY_JPEG,
      xmpSegment(true),
      iptcSegment(),
      commentSegment('secret'),
      mpfSegment(),
      iccSegment(),
      segment(0xe3, ascii('Meta')),
      segment(0xef, ascii('x')),
      adobeSegment(),
    );
    const stripped = stripJpegMetadata(jpeg);
    expect(headerMarkers(stripped)).toEqual([APP2, APP14, APP0, ...TINY_TABLES]);
    const report = findJpegMetadata(stripped);
    expect(report).toMatchObject({ xmp: false, iptc: false, comment: false, icc: true, adobe: true });
    expect(isMetadataFree(report)).toBe(true);
    // Kept segments are byte-for-byte unchanged.
    expect(stripped.subarray(2, 2 + iccSegment().length)).toEqual(iccSegment());
  });

  it('drops a non-JFIF APP0 (JFXX thumbnail extension)', () => {
    const jfxx = segment(APP0, concat(ascii('JFXX\0'), new Uint8Array([0x13, 1, 1, 0, 0])));
    expect(stripJpegMetadata(withSegmentsAfterSoi(TINY_JPEG, jfxx))).toEqual(TINY_JPEG);
  });

  it('cleans a camera-like file: no GPS, Exif, XMP, IPTC, COM, or trailing image; ICC and scan data kept', () => {
    const original = cameraLikeJpeg();
    const stripped = stripJpegMetadata(original);
    expectJpegShape(stripped);
    expect(hasLocationMetadata(stripped)).toBe(false);
    const report = findJpegMetadata(stripped);
    expect(report).toMatchObject({ exif: false, xmp: false, iptc: false, comment: false, icc: true, trailingBytes: 0 });
    expect(isMetadataFree(report)).toBe(true);
    expect(headerMarkers(stripped)).toEqual([APP2, APP0, ...TINY_TABLES]);
    expect(scanBytes(stripped)).toEqual(scanBytes(TINY_JPEG));
    expect(stripped.length).toBe(TINY_JPEG.length + iccSegment().length);
    // Exactly the clean image with its ICC profile, nothing else.
    expect(stripped).toEqual(withSegmentsAfterSoi(TINY_JPEG, iccSegment()));
  });

  it("strips a real encoder's output (sips) back to the clean image", () => {
    expect(stripJpegMetadata(SIPS_JPEG)).toEqual(TINY_JPEG);
  });

  it('is idempotent', () => {
    for (const jpeg of [cameraLikeJpeg(), SIPS_JPEG, TINY_JPEG]) {
      const once = stripJpegMetadata(jpeg);
      expect(stripJpegMetadata(once)).toEqual(once);
    }
  });

  it('returns a new array and does not modify its input', () => {
    const jpeg = cameraLikeJpeg();
    const copy = jpeg.slice();
    const stripped = stripJpegMetadata(TINY_JPEG);
    stripJpegMetadata(jpeg);
    expect(jpeg).toEqual(copy);
    expect(stripped).not.toBe(TINY_JPEG);
  });

  it('copies scan data with stuffing, RSTn, and fill bytes unchanged', () => {
    const sosAt = TINY_JPEG.length - scanBytes(TINY_JPEG).length;
    const header = TINY_JPEG.subarray(0, sosAt);
    // Entropy data with a stuffed 0xFF00, restart markers, and 0xFF fill before RST1.
    const scan = new Uint8Array([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xff, 0xd1, 0x78, 0xff, 0xd9]);
    const jpeg = concat(header, scan);
    const stripped = stripJpegMetadata(withSegmentsAfterSoi(jpeg, exifSegment({ order: 'II', gps: true })));
    expect(stripped).toEqual(jpeg);
  });

  it('applies the same rule between the scans of a progressive JPEG', () => {
    const sosAt = TINY_JPEG.length - scanBytes(TINY_JPEG).length;
    const header = TINY_JPEG.subarray(0, sosAt);
    const sos = segment(SOS, new Uint8Array([1, 1, 0, 0, 63, 0]));
    const dht = segment(DHT, new Uint8Array([0x10, ...new Array(16).fill(0)]));
    const jpeg = concat(header, new Uint8Array([0xaa, 0xbb]), commentSegment('between scans'), dht, sos, new Uint8Array([0xcc, 0xff, 0xd9]));
    const expected = concat(header, new Uint8Array([0xaa, 0xbb]), dht, sos, new Uint8Array([0xcc, 0xff, 0xd9]));
    expect(stripJpegMetadata(jpeg)).toEqual(expected);
  });

  it('removes fill bytes between header markers and keeps standalone markers', () => {
    // SOI, fill, APP0 JFIF (from TINY_JPEG), TEM, then the rest.
    const app0 = TINY_JPEG.subarray(2, 20);
    const jpeg = concat(TINY_JPEG.subarray(0, 2), new Uint8Array([0xff, 0xff]), app0, new Uint8Array([0xff, 0x01]), TINY_JPEG.subarray(20));
    const stripped = stripJpegMetadata(jpeg);
    expect(stripped).toEqual(concat(TINY_JPEG.subarray(0, 20), new Uint8Array([0xff, 0x01]), TINY_JPEG.subarray(20)));
    expect(stripJpegMetadata(stripped)).toEqual(stripped);
  });

  it('handles a segment holding only its length (length 2)', () => {
    expect(stripJpegMetadata(withSegmentsAfterSoi(TINY_JPEG, segment(APP1, new Uint8Array(0))))).toEqual(TINY_JPEG);
    expect(findJpegMetadata(withSegmentsAfterSoi(TINY_JPEG, segment(0xfe, new Uint8Array(0)))).comment).toBe(true);
  });

  it('skips a thumbnail JPEG inside Exif rather than parsing its markers', () => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', gps: true, thumbnail: SIPS_JPEG }));
    expect(stripJpegMetadata(jpeg)).toEqual(TINY_JPEG);
  });
});

describe('marker allowlist (fail closed)', () => {
  /** TINY_JPEG with `extra` inserted right before its SOS, where tables live. */
  function beforeSos(...extra: Uint8Array[]): Uint8Array {
    const sosAt = TINY_JPEG.length - scanBytes(TINY_JPEG).length - 14;
    return concat(TINY_JPEG.subarray(0, sosAt), ...extra, TINY_JPEG.subarray(sosAt));
  }

  it('rejects reserved markers 0x02-0xBF, JPG 0xC8, and JPGn 0xF0-0xFD with unsupported_marker', () => {
    const codes = [0x02, 0x10, 0x4f, 0x80, 0xbf, 0xc8, 0xf0, 0xf7, 0xfd];
    for (const code of codes) {
      expectFormatError(withSegmentsAfterSoi(TINY_JPEG, segment(code, ascii('anything'))), 'unsupported_marker');
      expectFormatError(beforeSos(segment(code, ascii('x'))), 'unsupported_marker');
    }
  });

  it('rejects every code outside the allowlist, and accepts every code inside it', () => {
    const allowed = new Set<number>([
      ...range(0xc0, 0xcf).filter((c) => c !== 0xc8), // SOFn, DHT, DAC
      0xdb, 0xdc, 0xdd, 0xde, 0xdf, // DQT, DNL, DRI, DHP, EXP
      ...range(0xe0, 0xef), // APPn (kept or removed by content)
      0xfe, // COM (removed)
    ]);
    for (let code = 0x02; code <= 0xfe; code++) {
      if (code >= 0xd0 && code <= 0xda) continue; // RSTn, SOI, EOI, SOS: structural, tested elsewhere
      const jpeg = withSegmentsAfterSoi(TINY_JPEG, segment(code, new Uint8Array([0, 0])));
      if (allowed.has(code)) expect(() => findJpegMetadata(jpeg)).not.toThrow();
      else expectFormatError(jpeg, 'unsupported_marker');
    }
  });

  it('keeps DNL, DHP, EXP, DAC, and other SOFn segments byte for byte', () => {
    const structural = [0xdc, 0xde, 0xdf, 0xcc, 0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xcf].map((code) =>
      segment(code, new Uint8Array([code, 1, 2, 3])),
    );
    const jpeg = beforeSos(...structural);
    const stripped = stripJpegMetadata(withSegmentsAfterSoi(jpeg, commentSegment('x')));
    expect(stripped).toEqual(jpeg);
    expect(findJpegMetadata(jpeg).removableSegments).toBe(0);
  });

  it('rejects an unknown marker between the scans of a progressive JPEG', () => {
    const sosAt = TINY_JPEG.length - scanBytes(TINY_JPEG).length;
    const header = TINY_JPEG.subarray(0, sosAt);
    const sos = segment(SOS, new Uint8Array([1, 1, 0, 0, 63, 0]));
    const jpeg = concat(header, new Uint8Array([0xaa]), segment(0xf3, ascii('hidden')), sos, new Uint8Array([0xcc, 0xff, 0xd9]));
    expectFormatError(jpeg, 'unsupported_marker');
  });

  it('drops an APP14 that only starts with "Adobe" but is too short to be one', () => {
    const short = segment(APP14, ascii('Adobe'));
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, short);
    expect(findJpegMetadata(jpeg)).toMatchObject({ adobe: false, removableSegments: 1 });
    expect(stripJpegMetadata(jpeg)).toEqual(TINY_JPEG);
  });
});

describe('ICC_PROFILE validation', () => {
  /** An APP2 ICC chunk with the given header bytes and body. */
  function icc(seq: number, count: number, body = 'profile-bytes'): Uint8Array {
    return segment(APP2, concat(ascii('ICC_PROFILE\0'), new Uint8Array([seq, count]), ascii(body)));
  }

  it('keeps a complete multi-chunk profile in file order, whatever the chunk order', () => {
    for (const chunks of [[icc(1, 3), icc(2, 3), icc(3, 3)], [icc(3, 3), icc(1, 3), icc(2, 3)]]) {
      const jpeg = withSegmentsAfterSoi(TINY_JPEG, ...chunks);
      expect(findJpegMetadata(jpeg)).toMatchObject({ icc: true, removableSegments: 0 });
      expect(stripJpegMetadata(jpeg)).toEqual(jpeg);
    }
  });

  it.each([
    ['sequence number 0', [icc(0, 1)]],
    ['count 0', [icc(1, 0)]],
    ['sequence past the count', [icc(2, 1)]],
    ['a missing chunk', [icc(1, 2)]],
    ['a repeated chunk', [icc(1, 2), icc(1, 2)]],
    ['chunks that disagree on the count', [icc(1, 2), icc(2, 3)]],
    ['no profile bytes', [icc(1, 1, '')]],
    ['no sequence or count bytes', [segment(APP2, ascii('ICC_PROFILE\0'))]],
    ['one bad chunk among good ones', [icc(1, 2), icc(2, 2, '')]],
  ])('drops every ICC chunk when there is %s', (_, chunks) => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, ...(chunks as Uint8Array[]));
    const report = findJpegMetadata(jpeg);
    expect(report.icc).toBe(false);
    expect(report.removableSegments).toBe((chunks as Uint8Array[]).length);
    const stripped = stripJpegMetadata(jpeg);
    expect(stripped).toEqual(TINY_JPEG);
    expect(isMetadataFree(findJpegMetadata(stripped))).toBe(true);
  });

  it('a valid profile next to an MPF APP2 keeps only the profile', () => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, mpfSegment(), iccSegment());
    expect(stripJpegMetadata(jpeg)).toEqual(withSegmentsAfterSoi(TINY_JPEG, iccSegment()));
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe('orientationProblem', () => {
  it('accepts no Orientation and Orientation 1', () => {
    expect(orientationProblem(findJpegMetadata(TINY_JPEG))).toBeNull();
    expect(orientationProblem(findJpegMetadata(withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', orientation: 1 }))))).toBeNull();
  });

  it.each([0, 2, 3, 4, 5, 6, 7, 8, 9])('rejects Orientation %i', (orientation) => {
    const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', orientation }));
    expect(orientationProblem(findJpegMetadata(jpeg))).toMatch(`orientation ${orientation} is not upright`);
  });

  it.each([
    ['LONG', { type: 4, count: 1 }],
    ['BYTE', { type: 1, count: 1 }],
    ['two SHORTs', { type: 3, count: 2 }],
  ])('treats an Orientation stored as %s as unreadable, not upright', (_, orientationEntry) => {
    for (const value of [1, 6]) {
      const jpeg = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', orientation: value, orientationEntry }));
      const report = findJpegMetadata(jpeg);
      expect(report).toMatchObject({ exif: true, exifReadable: false });
      expect(orientationProblem(report)).toMatch(/unknown/);
      expect(hasLocationMetadata(jpeg)).toBe(true);
      // The stripper still removes it.
      expect(stripJpegMetadata(jpeg)).toEqual(TINY_JPEG);
    }
  });

  it('rejects Exif too broken to read', () => {
    const broken = segment(APP1, concat(ascii('Exif\0\0'), ascii('XX'), new Uint8Array([0, 42, 0, 0, 0, 8])));
    expect(orientationProblem(findJpegMetadata(withSegmentsAfterSoi(TINY_JPEG, broken)))).toMatch(/unknown/);
  });
});

describe('assertStrippedCopy', () => {
  it('passes for an exact, clean copy', () => {
    const clean = stripJpegMetadata(cameraLikeJpeg());
    expect(() => assertStrippedCopy(clean.slice(), clean)).not.toThrow();
  });

  it('fails when the bytes on disk differ from what was written', () => {
    const clean = stripJpegMetadata(cameraLikeJpeg());
    const changed = clean.slice();
    changed[changed.length - 3] ^= 1;
    expect(() => assertStrippedCopy(changed, clean)).toThrow(/not written correctly/);
    expect(() => assertStrippedCopy(clean.subarray(0, 10), clean)).toThrow(/not written correctly/);
  });

  it('fails when the expected bytes themselves still carry metadata', () => {
    const dirty = cameraLikeJpeg();
    expect(() => assertStrippedCopy(dirty.slice(), dirty)).toThrow(/still present/);
  });
});

describe('malformed input', () => {
  const sosAt = TINY_JPEG.length - scanBytes(TINY_JPEG).length;

  it('rejects data that is not a JPEG', () => {
    expectFormatError(new Uint8Array(0), 'not_jpeg');
    expectFormatError(new Uint8Array([0xff]), 'not_jpeg');
    expectFormatError(ascii('\x89PNG\r\n\x1a\n'), 'not_jpeg');
    expectFormatError(new Uint8Array([0xd8, 0xff]), 'not_jpeg');
  });

  it('rejects truncated files at every cut point', () => {
    for (const jpeg of [TINY_JPEG, cameraLikeJpeg().subarray(0, findEnd(cameraLikeJpeg()))]) {
      for (let cut = 2; cut < jpeg.length; cut++) {
        const piece = jpeg.subarray(0, cut);
        expect(() => stripJpegMetadata(piece)).toThrow(JpegFormatError);
        expect(() => findJpegMetadata(piece)).toThrow(JpegFormatError);
      }
    }
  });

  it('rejects a segment whose length runs past the end', () => {
    expectFormatError(concat(TINY_JPEG.subarray(0, 2), new Uint8Array([0xff, APP1, 0xff, 0xff, 1, 2, 3])), 'truncated');
  });

  it('rejects segment lengths below 2', () => {
    for (const length of [0, 1]) {
      expectFormatError(withSegmentsAfterSoi(TINY_JPEG, new Uint8Array([0xff, APP1, 0, length])), 'bad_length');
    }
  });

  it('rejects garbage where a marker should be', () => {
    expectFormatError(withSegmentsAfterSoi(TINY_JPEG, new Uint8Array([0x00, 0x11])), 'bad_marker');
    expectFormatError(withSegmentsAfterSoi(TINY_JPEG, new Uint8Array([0xff, 0x00])), 'bad_marker');
    expectFormatError(withSegmentsAfterSoi(TINY_JPEG, new Uint8Array([0xff, SOI])), 'bad_marker');
  });

  it('rejects EOI before any scan, and a scan with no EOI', () => {
    expectFormatError(concat(TINY_JPEG.subarray(0, sosAt - 14), new Uint8Array([0xff, 0xd9])), 'missing_scan');
    expectFormatError(TINY_JPEG.subarray(0, TINY_JPEG.length - 2), 'truncated');
    expectFormatError(concat(TINY_JPEG.subarray(0, TINY_JPEG.length - 2), new Uint8Array([0xff, 0xff, 0xff])), 'truncated');
  });

  it('terminates on long runs of 0xFF', () => {
    const fill = new Uint8Array(100_000).fill(0xff);
    expectFormatError(concat(TINY_JPEG.subarray(0, 2), fill), 'truncated');
    expectFormatError(concat(TINY_JPEG.subarray(0, sosAt), fill), 'truncated');
  });

  it('survives random corruption without hanging or throwing anything but JpegFormatError', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const base = cameraLikeJpeg();
    let succeeded = 0;
    for (let round = 0; round < 300; round++) {
      const bytes = base.slice();
      for (let n = 0; n < 4; n++) bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
      for (const run of [() => stripJpegMetadata(bytes), () => findJpegMetadata(bytes)]) {
        try {
          run();
        } catch (error) {
          expect(error).toBeInstanceOf(JpegFormatError);
        }
      }
      let stripped: Uint8Array | null = null;
      try {
        stripped = stripJpegMetadata(bytes);
      } catch {
        // Rejected input is covered above.
      }
      if (stripped) {
        // Whatever the stripper accepts, its output parses, is clean, and is stable.
        succeeded++;
        expectJpegShape(stripped);
        expect(isMetadataFree(findJpegMetadata(stripped))).toBe(true);
        expect(hasLocationMetadata(stripped)).toBe(false);
        expect(stripJpegMetadata(stripped)).toEqual(stripped);
      }
    }
    // The run must exercise the success path, not only rejections.
    expect(succeeded).toBeGreaterThan(20);
  });
});

/** Length of the primary image, without the data appended after its EOI. */
function findEnd(jpeg: Uint8Array): number {
  return jpeg.length - findJpegMetadata(jpeg).trailingBytes;
}
