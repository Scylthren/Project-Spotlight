/**
 * TEST-ONLY JPEG byte fixtures, built in code instead of binary files.
 *
 * `TINY_JPEG` is a real, decodable 8x8 baseline JPEG (JFIF, DQT, SOF0, DHT,
 * DRI, SOS, EOI): macOS `sips` output for a generated bitmap, with the Exif
 * and Photoshop segments sips adds removed. `SIPS_JPEG` is the unmodified
 * sips output, a real encoder's Exif (big-endian) plus APP13 Photoshop.
 * The builders add synthetic metadata segments around them.
 */

export function hex(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const TABLES_AND_SCAN = `
ffc00011080008000803012200021101031101ffc4001f0000010501010101010100000000000000
000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1
c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778
797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5
e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403
040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a26272829
2a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4
a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffdb00430006060606
06060a06060a0e0a0a0a0e120e0e0e0e12171212121212171c1717171717171c1c1c1c1c1c1c1c22222222222227272727272c2c2c2c2c2c2c2c2c2c
ffdb0043010707070b0a0b130a0a132e1f1a1f2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e
2e2e2e2e2e2e2e2e2effdd00040001ffda000c03010002110311003f00bd69e06e9fbbfd2b47fe106ffa67fa57a35a76ad2ac387b36c47d4a1ef1ebd
5cf317cdf11fffd9`;

const JFIF_APP0 = 'ffe000104a46494600010100004800480000';

const SIPS_EXIF_AND_APP13 = `
ffe100804578696600004d4d002a000000080004011a0005000000010000003e011b000500000001
0000004601280003000000010002000087690004000000010000004e00000000000000480000000100000048000000010003a0010003000000010001
0000a00200040000000100000008a0030004000000010000000800000000ffed003850686f746f73686f7020332e30003842494d0404000000000000
3842494d0425000000000010d41d8cd98f00b204e9800998ecf8427e`;

/** Real decodable 8x8 baseline JPEG with no metadata (668 bytes). */
export const TINY_JPEG = hex(`ffd8${JFIF_APP0}${TABLES_AND_SCAN}`);

/** Unmodified macOS sips output: JFIF, Exif (MM, no GPS), APP13 Photoshop, then the same image. */
export const SIPS_JPEG = hex(`ffd8${JFIF_APP0}${SIPS_EXIF_AND_APP13}${TABLES_AND_SCAN}`);

/** A marker segment: 0xFF, marker, big-endian length (payload + 2), payload. */
export function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  return concat(new Uint8Array([0xff, marker, length >> 8, length & 0xff]), payload);
}

/** `jpeg` with `segments` inserted right after SOI. */
export function withSegmentsAfterSoi(jpeg: Uint8Array, ...segments: Uint8Array[]): Uint8Array {
  return concat(jpeg.subarray(0, 2), ...segments, jpeg.subarray(2));
}

/** Bytes after the first SOS header up to and including EOI. */
export function scanBytes(jpeg: Uint8Array): Uint8Array {
  for (let i = 2; i + 3 < jpeg.length; i++) {
    if (jpeg[i] === 0xff && jpeg[i + 1] === 0xda) {
      const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
      const end = lastEoi(jpeg);
      return jpeg.subarray(i + 2 + length, end);
    }
  }
  throw new Error('no SOS');
}

function lastEoi(jpeg: Uint8Array): number {
  for (let i = jpeg.length - 2; i >= 0; i--) if (jpeg[i] === 0xff && jpeg[i + 1] === 0xd9) return i + 2;
  throw new Error('no EOI');
}

/** Marker codes of every segment before the first SOS, in order (assumes no fill bytes). */
export function headerMarkers(jpeg: Uint8Array): number[] {
  const markers: number[] = [];
  let i = 2;
  while (i + 3 < jpeg.length) {
    const marker = jpeg[i + 1];
    markers.push(marker);
    if (marker === 0xda) break;
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return markers;
}

export type ByteOrder = 'II' | 'MM';

/** Minimal TIFF writer for Exif blocks. */
class TiffWriter {
  private readonly bytes: number[] = [];
  constructor(private readonly order: ByteOrder) {}
  get length() {
    return this.bytes.length;
  }
  u8(...values: number[]) {
    this.bytes.push(...values);
  }
  u16(value: number) {
    const b = [(value >> 8) & 0xff, value & 0xff];
    this.bytes.push(...(this.order === 'II' ? b.reverse() : b));
  }
  u32(value: number) {
    const b = [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    this.bytes.push(...(this.order === 'II' ? b.reverse() : b));
  }
  patch32(at: number, value: number) {
    const saved = this.bytes.splice(at);
    this.u32(value);
    this.bytes.push(...saved.slice(4));
  }
  toBytes() {
    return new Uint8Array(this.bytes);
  }
}

type Entry = { tag: number; type: number; count: number; value: number } | { tag: number; data: number[] };

function writeIfd(w: TiffWriter, entries: Entry[], next = 0): void {
  // Values that do not fit in 4 bytes go right after the IFD.
  w.u16(entries.length);
  let dataAt = w.length + entries.length * 12 + 4;
  const later: number[][] = [];
  for (const e of entries) {
    w.u16(e.tag);
    if ('data' in e) {
      w.u16(e.data.length > 8 ? 5 : 2); // RATIONAL triples or ASCII
      w.u32(e.data.length > 8 ? e.data.length / 8 : e.data.length);
      if (e.data.length <= 4) {
        w.u8(...e.data, ...new Array(4 - e.data.length).fill(0));
      } else {
        w.u32(dataAt);
        later.push(e.data);
        dataAt += e.data.length;
      }
    } else {
      w.u16(e.type);
      w.u32(e.count);
      if (e.type === 3) {
        w.u16(e.value);
        w.u16(0);
      } else w.u32(e.value);
    }
  }
  w.u32(next);
  for (const data of later) w.u8(...data);
}

function rationalBytes(order: ByteOrder, values: [number, number][]): number[] {
  const w = new TiffWriter(order);
  for (const [n, d] of values) {
    w.u32(n);
    w.u32(d);
  }
  return [...w.toBytes()];
}

export interface ExifOptions {
  order: ByteOrder;
  gps?: boolean;
  orientation?: number;
  /** TIFF type and count of the Orientation entry. Default: one SHORT (3), as the spec requires. */
  orientationEntry?: { type: number; count: number };
  /** A JPEG thumbnail stored in IFD1, as cameras do. */
  thumbnail?: Uint8Array;
}

/** An APP1 Exif payload ("Exif\0\0" + TIFF) with Make, optional Orientation, GPS IFD, and thumbnail. */
export function exifPayload(options: ExifOptions): Uint8Array {
  const { order } = options;
  const w = new TiffWriter(order);
  w.u8(...ascii(order));
  w.u16(42);
  w.u32(8);
  const make = [...ascii('Cam\0')];
  const ifd0: Entry[] = [{ tag: 0x010f, data: make }];
  if (options.orientation !== undefined) {
    const { type, count } = options.orientationEntry ?? { type: 3, count: 1 };
    ifd0.push({ tag: 0x0112, type, count, value: options.orientation });
  }
  const gpsPointerIndex = ifd0.length;
  if (options.gps) ifd0.push({ tag: 0x8825, type: 4, count: 1, value: 0 });
  const ifd0Start = w.length;
  writeIfd(w, ifd0, 0);
  const nextIfdField = ifd0Start + 2 + ifd0.length * 12;
  if (options.gps) {
    w.patch32(ifd0Start + 2 + gpsPointerIndex * 12 + 8, w.length);
    writeIfd(w, [
      { tag: 0x0001, data: [...ascii('N\0')] },
      { tag: 0x0002, data: rationalBytes(order, [[51, 1], [30, 1], [2601, 100]]) },
      { tag: 0x0003, data: [...ascii('W\0')] },
      { tag: 0x0004, data: rationalBytes(order, [[0, 1], [7, 1], [3999, 100]]) },
    ]);
  }
  if (options.thumbnail) {
    w.patch32(nextIfdField, w.length);
    const ifd1Start = w.length;
    writeIfd(w, [
      { tag: 0x0201, type: 4, count: 1, value: 0 },
      { tag: 0x0202, type: 4, count: 1, value: options.thumbnail.length },
    ]);
    w.patch32(ifd1Start + 2 + 8, w.length);
    w.u8(...options.thumbnail);
  }
  return concat(ascii('Exif\0\0'), w.toBytes());
}

export function exifSegment(options: ExifOptions): Uint8Array {
  return segment(0xe1, exifPayload(options));
}

export function xmpSegment(withGps: boolean): Uint8Array {
  const gps = withGps ? ' exif:GPSLatitude="51,30.26N" exif:GPSLongitude="0,7.39W"' : '';
  const packet = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description${gps} xmp:CreatorTool="Cam"/></rdf:RDF></x:xmpmeta>`;
  return segment(0xe1, concat(ascii('http://ns.adobe.com/xap/1.0/\0'), ascii(packet)));
}

export function iccSegment(): Uint8Array {
  // Identifier, chunk 1 of 1, then a stand-in profile body.
  return segment(0xe2, concat(ascii('ICC_PROFILE\0'), new Uint8Array([1, 1]), ascii('appl mntrRGB XYZ fake-profile')));
}

export function mpfSegment(): Uint8Array {
  return segment(0xe2, concat(ascii('MPF\0'), ascii('MM'), new Uint8Array([0, 0x2a, 0, 0, 0, 8, 0, 0])));
}

export function iptcSegment(): Uint8Array {
  // Photoshop IRB with an IPTC record carrying a city name.
  return segment(
    0xed,
    concat(ascii('Photoshop 3.0\0'), ascii('8BIM'), new Uint8Array([0x04, 0x04, 0, 0, 0, 0, 0, 12]), ascii('\x1c\x02\x5a\x00\x06London')),
  );
}

export function adobeSegment(): Uint8Array {
  return segment(0xee, concat(ascii('Adobe'), new Uint8Array([0, 100, 0, 0, 0, 0, 1])));
}

export function commentSegment(text: string): Uint8Array {
  return segment(0xfe, ascii(text));
}

/**
 * Shaped like a phone camera file: Exif first (little-endian, GPS,
 * Orientation `orientation` (default 6), an embedded JPEG thumbnail), MPF,
 * XMP with GPS, ICC, IPTC, a comment, then the image, then a second "MPF"
 * image after EOI that has its own GPS Exif.
 */
export function cameraLikeJpeg(orientation = 6): Uint8Array {
  const secondImage = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', gps: true }));
  return concat(
    withSegmentsAfterSoi(
      TINY_JPEG,
      exifSegment({ order: 'II', gps: true, orientation, thumbnail: TINY_JPEG }),
      mpfSegment(),
      xmpSegment(true),
      iccSegment(),
      iptcSegment(),
      commentSegment('shot on a phone'),
    ),
    secondImage,
  );
}
