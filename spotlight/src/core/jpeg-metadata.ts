/**
 * JPEG metadata stripping and inspection, in plain TypeScript over bytes.
 *
 * `stripJpegMetadata` rebuilds a JPEG keeping only what decoding needs. The
 * rule is an explicit allowlist that fails closed:
 * - kept: the structural markers decoding uses (SOFn 0xC0-0xCF except 0xC4,
 *   0xC8, 0xCC; DHT 0xC4; DAC 0xCC; DQT; DRI; DNL; SOS; DHP; EXP; RSTn; TEM),
 *   APP0 JFIF, APP2 ICC_PROFILE when the chunks form one complete, consistent
 *   profile (see `iccChunksAreValid`), and APP14 Adobe (needed to decode some
 *   CMYK/YCCK files);
 * - removed: APP1 (Exif, XMP, anything else), APP13 (Photoshop/IPTC), every
 *   other APPn (including MPF and JFXX thumbnails, and malformed or incomplete
 *   ICC chunks), COM, fill bytes between markers, and anything after EOI
 *   (where some cameras append extra images, each with its own Exif);
 * - rejected with `JpegFormatError('unsupported_marker')`: every other marker
 *   code (reserved 0x02-0xBF, JPG 0xC8, JPGn 0xF0-0xFD), since its layout is
 *   unknown and it might carry data we cannot see.
 * Entropy-coded scan data (including RSTn markers and byte stuffing) is
 * copied unchanged. The same keep rule applies to markers between the scans
 * of a progressive JPEG.
 *
 * `findJpegMetadata` reports what a file carries, using the same parser and
 * rule, so a stripped file always reports `removableSegments === 0`.
 *
 * Malformed input throws `JpegFormatError`. Every loop advances by at least
 * one byte and every read is bounds-checked, so no input can hang or read
 * outside `bytes`.
 */

export type JpegErrorCode =
  | 'not_jpeg' // does not start with SOI
  | 'truncated' // a marker, length, or segment runs past the end, or no EOI
  | 'bad_marker' // a byte that should start a marker does not, or SOI/EOI in the wrong place
  | 'bad_length' // segment length below 2
  | 'missing_scan' // EOI before any SOS
  | 'unsupported_marker'; // a marker code outside the allowlist (reserved, JPG, JPGn)

export class JpegFormatError extends Error {
  constructor(
    readonly code: JpegErrorCode,
    message: string,
  ) {
    super(`invalid JPEG (${code}): ${message}`);
    this.name = 'JpegFormatError';
  }
}

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP13 = 0xed;
const APP14 = 0xee;
const APP15 = 0xef;
const COM = 0xfe;
const TEM = 0x01;
const JPG = 0xc8;
const DQT = 0xdb;
const DNL = 0xdc;
const DRI = 0xdd;
const DHP = 0xde;
const EXP = 0xdf;

/** Tag ids in an Exif IFD0. */
const TAG_ORIENTATION = 0x0112;
const TAG_GPS_INFO = 0x8825;
const TIFF_SHORT = 3;

/** A part of the file between SOI and EOI, as byte offsets into the input. */
type Piece =
  /** A marker with a length field. `start` is the 0xFF byte; the payload starts at `start + 4`. */
  | { kind: 'segment'; marker: number; start: number; end: number }
  /** A marker without a length (RSTn, TEM) outside scan data. */
  | { kind: 'standalone'; marker: number; start: number; end: number }
  /** Entropy-coded data after an SOS header, up to the next non-RST marker. */
  | { kind: 'entropy'; start: number; end: number };

interface JpegLayout {
  pieces: Piece[];
  /** Bytes after EOI. */
  trailingBytes: number;
}

function isStandalone(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd7) || marker === TEM;
}

/** True if `bytes[at..]` starts with the ASCII text `prefix`. */
function startsWithAscii(bytes: Uint8Array, at: number, end: number, prefix: string): boolean {
  if (at + prefix.length > end) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[at + i] !== prefix.charCodeAt(i)) return false;
  return true;
}

function containsAscii(bytes: Uint8Array, start: number, end: number, text: string): boolean {
  for (let i = start; i + text.length <= end; i++) if (startsWithAscii(bytes, i, end, text)) return true;
  return false;
}

const EXIF_ID = 'Exif\0';
const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXTENDED_ID = 'http://ns.adobe.com/xmp/extension/\0';
const ICC_ID = 'ICC_PROFILE\0';
const JFIF_ID = 'JFIF\0';
const ADOBE_ID = 'Adobe';

/**
 * Markers with a length field that decoding needs and that carry no
 * metadata: SOF0-SOF15 (0xC0-0xCF, where 0xC4 is DHT and 0xCC is DAC, both
 * also needed; 0xC8 JPG is reserved and excluded), DQT, DNL, DRI, SOS, DHP, EXP.
 */
function isStructural(marker: number): boolean {
  if (marker >= 0xc0 && marker <= 0xcf) return marker !== JPG;
  return marker === DQT || marker === DNL || marker === DRI || marker === SOS || marker === DHP || marker === EXP;
}

/** Markers with a length field that the parser accepts: structural ones, APPn, and COM. */
function isKnownSegment(marker: number): boolean {
  return isStructural(marker) || (marker >= APP0 && marker <= APP15) || marker === COM;
}

/** ICC_PROFILE chunk header: identifier, 1-based sequence number, chunk count, then profile bytes. */
const ICC_HEADER_LENGTH = ICC_ID.length + 2;

/**
 * True if the APP2 ICC_PROFILE segments form one complete profile: every
 * chunk has a sequence number in 1..count and at least one profile byte, all
 * chunks agree on the count, and each sequence number appears exactly once.
 * Only then are they kept; otherwise all of them are dropped, so the output
 * never carries a partial or inconsistent profile.
 */
function iccChunksAreValid(bytes: Uint8Array, pieces: readonly Piece[]): boolean {
  let count = -1;
  const seen = new Set<number>();
  for (const piece of pieces) {
    if (piece.kind !== 'segment' || piece.marker !== APP2) continue;
    const payload = piece.start + 4;
    if (!startsWithAscii(bytes, payload, piece.end, ICC_ID)) continue;
    if (piece.end - payload <= ICC_HEADER_LENGTH) return false;
    const seq = bytes[payload + ICC_ID.length];
    const total = bytes[payload + ICC_ID.length + 1];
    if (total === 0 || seq === 0 || seq > total) return false;
    if (count !== -1 && total !== count) return false;
    if (seen.has(seq)) return false;
    count = total;
    seen.add(seq);
  }
  return seen.size === 0 || seen.size === count;
}

/** Adobe APP14: "Adobe", version (2), flags0 (2), flags1 (2), color transform (1). */
const ADOBE_PAYLOAD_LENGTH = ADOBE_ID.length + 7;

/** Per-file facts the keep rule needs. */
interface KeepContext {
  iccValid: boolean;
}

/** Whether the stripper keeps a segment (see the module comment). Only called for markers the parser accepted. */
function keepsSegment(bytes: Uint8Array, marker: number, payloadStart: number, end: number, context: KeepContext): boolean {
  if (isStructural(marker)) return true;
  if (marker === APP0) return startsWithAscii(bytes, payloadStart, end, JFIF_ID);
  if (marker === APP2) return context.iccValid && startsWithAscii(bytes, payloadStart, end, ICC_ID);
  if (marker === APP14) return end - payloadStart >= ADOBE_PAYLOAD_LENGTH && startsWithAscii(bytes, payloadStart, end, ADOBE_ID);
  // COM and every other APPn.
  return false;
}

function keepContext(bytes: Uint8Array, pieces: readonly Piece[]): KeepContext {
  return { iccValid: iccChunksAreValid(bytes, pieces) };
}

/** Reads one marker at `pos` (0xFF, optional 0xFF fill, code). Returns the code and the index after it. */
function readMarker(bytes: Uint8Array, pos: number): { marker: number; next: number } {
  if (pos >= bytes.length) throw new JpegFormatError('truncated', `expected a marker at ${pos}`);
  if (bytes[pos] !== 0xff) throw new JpegFormatError('bad_marker', `expected 0xFF at ${pos}`);
  let p = pos + 1;
  while (p < bytes.length && bytes[p] === 0xff) p++;
  if (p >= bytes.length) throw new JpegFormatError('truncated', `marker at ${pos} has no code`);
  const marker = bytes[p];
  if (marker === 0x00) throw new JpegFormatError('bad_marker', `0xFF00 outside scan data at ${pos}`);
  return { marker, next: p + 1 };
}

/**
 * Finds the end of entropy-coded data starting at `pos`: the first 0xFF
 * (with any fill 0xFFs) followed by a code other than 0x00 (stuffing) or
 * RSTn. Returns that 0xFF's index.
 */
function scanEntropy(bytes: Uint8Array, pos: number): number {
  let p = pos;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) {
      p++;
      continue;
    }
    let q = p + 1;
    while (q < bytes.length && bytes[q] === 0xff) q++;
    if (q >= bytes.length) break;
    const code = bytes[q];
    if (code === 0x00 || (code >= 0xd0 && code <= 0xd7)) {
      p = q + 1;
      continue;
    }
    return p;
  }
  throw new JpegFormatError('truncated', 'scan data has no EOI');
}

function parseJpeg(bytes: Uint8Array): JpegLayout {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== SOI) {
    throw new JpegFormatError('not_jpeg', 'missing SOI');
  }
  const pieces: Piece[] = [];
  let pos = 2;
  let seenScan = false;
  for (;;) {
    const start = pos;
    const { marker, next } = readMarker(bytes, pos);
    if (marker === EOI) {
      if (!seenScan) throw new JpegFormatError('missing_scan', 'EOI before any SOS');
      return { pieces, trailingBytes: bytes.length - next };
    }
    if (marker === SOI) throw new JpegFormatError('bad_marker', `SOI inside the image at ${start}`);
    if (isStandalone(marker)) {
      pieces.push({ kind: 'standalone', marker, start: next - 2, end: next });
      pos = next;
      continue;
    }
    if (!isKnownSegment(marker)) {
      throw new JpegFormatError('unsupported_marker', `marker 0x${marker.toString(16).padStart(2, '0')} at ${start}`);
    }
    if (next + 2 > bytes.length) throw new JpegFormatError('truncated', `segment length at ${next}`);
    const length = (bytes[next] << 8) | bytes[next + 1];
    if (length < 2) throw new JpegFormatError('bad_length', `segment length ${length} at ${next}`);
    const end = next + length;
    if (end > bytes.length) throw new JpegFormatError('truncated', `segment at ${start} runs past the end`);
    // Pieces start at the marker's own 0xFF, so fill bytes before it are dropped.
    pieces.push({ kind: 'segment', marker, start: next - 2, end });
    pos = end;
    if (marker === SOS) {
      seenScan = true;
      const entropyEnd = scanEntropy(bytes, pos);
      if (entropyEnd > pos) pieces.push({ kind: 'entropy', start: pos, end: entropyEnd });
      pos = entropyEnd;
    }
  }
}

/** Returns a copy of `bytes` with metadata removed (see the module comment). Throws `JpegFormatError`. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { pieces } = parseJpeg(bytes);
  const context = keepContext(bytes, pieces);
  const kept: Piece[] = [];
  let size = 4; // SOI + EOI
  for (const piece of pieces) {
    if (piece.kind === 'segment' && !keepsSegment(bytes, piece.marker, piece.start + 4, piece.end, context)) continue;
    kept.push(piece);
    size += piece.end - piece.start;
  }
  const out = new Uint8Array(size);
  out[0] = 0xff;
  out[1] = SOI;
  let at = 2;
  for (const piece of kept) {
    out.set(bytes.subarray(piece.start, piece.end), at);
    at += piece.end - piece.start;
  }
  out[at] = 0xff;
  out[at + 1] = EOI;
  return out;
}

export interface JpegMetadataReport {
  /** An APP1 Exif segment is present. */
  exif: boolean;
  /** False if an Exif segment is present but its TIFF structure could not be read. */
  exifReadable: boolean;
  /** An Exif IFD0 has a GPSInfo pointer (tag 0x8825). */
  gps: boolean;
  /** Exif IFD0 Orientation (1-8 when valid), or null if absent. */
  orientation: number | null;
  /** An APP1 XMP (or extended XMP) segment is present. */
  xmp: boolean;
  /** An XMP segment mentions GPSLatitude or GPSLongitude. */
  xmpGps: boolean;
  /** An APP13 (Photoshop / IPTC) segment is present. */
  iptc: boolean;
  /** A COM segment is present. */
  comment: boolean;
  /** A complete, valid APP2 ICC_PROFILE is present (kept by the stripper). Malformed chunks count as removable instead. */
  icc: boolean;
  /** A well-formed APP14 Adobe segment is present (kept by the stripper). */
  adobe: boolean;
  /** Number of segments the stripper would remove. */
  removableSegments: number;
  /** Bytes after EOI (removed by the stripper). */
  trailingBytes: number;
}

/** Big- or little-endian reader over the TIFF block inside an Exif segment; throws on out-of-range reads. */
class TiffReader {
  constructor(
    private readonly bytes: Uint8Array,
    private readonly start: number,
    private readonly end: number,
    private readonly little: boolean,
  ) {}

  private at(offset: number, size: number): number {
    const i = this.start + offset;
    if (offset < 0 || i + size > this.end) throw new RangeError('TIFF read out of range');
    return i;
  }

  u16(offset: number): number {
    const i = this.at(offset, 2);
    return this.little ? this.bytes[i] | (this.bytes[i + 1] << 8) : (this.bytes[i] << 8) | this.bytes[i + 1];
  }

  u32(offset: number): number {
    const i = this.at(offset, 4);
    const b = this.bytes;
    const value = this.little
      ? b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)
      : (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    return value >>> 0;
  }
}

/** Reads GPS pointer presence and Orientation from IFD0 of an Exif payload. Throws if unreadable. */
function readExifIfd0(bytes: Uint8Array, payloadStart: number, end: number): { gps: boolean; orientation: number | null } {
  const tiff = payloadStart + 6; // "Exif\0" + one pad byte
  if (tiff + 8 > end) throw new RangeError('Exif too short');
  let little: boolean;
  if (bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49) little = true;
  else if (bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d) little = false;
  else throw new RangeError('bad TIFF byte order');
  const reader = new TiffReader(bytes, tiff, end, little);
  if (reader.u16(2) !== 42) throw new RangeError('bad TIFF magic');
  const ifd0 = reader.u32(4);
  const count = reader.u16(ifd0);
  let gps = false;
  let orientation: number | null = null;
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    const tag = reader.u16(entry);
    if (tag === TAG_GPS_INFO) gps = true;
    if (tag === TAG_ORIENTATION) {
      // Orientation must be one SHORT. Anything else cannot be read reliably,
      // so the Exif counts as unreadable (fail closed), never as upright.
      if (reader.u16(entry + 2) !== TIFF_SHORT || reader.u32(entry + 4) !== 1) {
        throw new RangeError('Orientation is not a single SHORT');
      }
      orientation = reader.u16(entry + 8);
    }
  }
  return { gps, orientation };
}

/** Reports the metadata in a JPEG. Throws `JpegFormatError` if the file cannot be parsed. */
export function findJpegMetadata(bytes: Uint8Array): JpegMetadataReport {
  const { pieces, trailingBytes } = parseJpeg(bytes);
  const context = keepContext(bytes, pieces);
  const report: JpegMetadataReport = {
    exif: false,
    exifReadable: true,
    gps: false,
    orientation: null,
    xmp: false,
    xmpGps: false,
    iptc: false,
    comment: false,
    icc: false,
    adobe: false,
    removableSegments: 0,
    trailingBytes,
  };
  for (const piece of pieces) {
    if (piece.kind !== 'segment') continue;
    const { marker, end } = piece;
    const payload = piece.start + 4;
    const kept = keepsSegment(bytes, marker, payload, end, context);
    if (!kept) report.removableSegments++;
    if (marker === COM) report.comment = true;
    else if (marker === APP13) report.iptc = true;
    else if (marker === APP2 && kept) report.icc = true;
    else if (marker === APP14 && kept) report.adobe = true;
    else if (marker === APP1 && startsWithAscii(bytes, payload, end, EXIF_ID)) {
      report.exif = true;
      try {
        const ifd0 = readExifIfd0(bytes, payload, end);
        report.gps ||= ifd0.gps;
        report.orientation ??= ifd0.orientation;
      } catch {
        report.exifReadable = false;
      }
    } else if (
      marker === APP1 &&
      (startsWithAscii(bytes, payload, end, XMP_ID) || startsWithAscii(bytes, payload, end, XMP_EXTENDED_ID))
    ) {
      report.xmp = true;
      if (containsAscii(bytes, payload, end, 'GPSLatitude') || containsAscii(bytes, payload, end, 'GPSLongitude')) {
        report.xmpGps = true;
      }
    }
  }
  return report;
}

/**
 * True if the JPEG may carry a location: an Exif GPS pointer, an Exif block
 * too broken to check, or XMP mentioning GPS coordinates. Throws
 * `JpegFormatError` if the file cannot be parsed.
 */
export function hasLocationMetadata(bytes: Uint8Array): boolean {
  const report = findJpegMetadata(bytes);
  return report.gps || (report.exif && !report.exifReadable) || report.xmpGps;
}

/** True if the stripper would remove nothing: no Exif, XMP, IPTC, comments, other APPn, or trailing data. */
export function isMetadataFree(report: JpegMetadataReport): boolean {
  return report.removableSegments === 0 && report.trailingBytes === 0;
}

/**
 * Null if the JPEG is safe to store without its Exif: no Orientation tag, or
 * Orientation 1. Otherwise a reason: any other Orientation (dropping the tag
 * would change how the photo looks), or an Exif block too broken to tell.
 * Callers fail rather than rotate (see ExpoImageProcessor).
 */
export function orientationProblem(report: JpegMetadataReport): string | null {
  if (report.exif && !report.exifReadable) return 'the Exif block cannot be read, so its orientation is unknown';
  if (report.orientation !== null && report.orientation !== 1) {
    return `Exif orientation ${report.orientation} is not upright`;
  }
  return null;
}

/**
 * Verify-after-write rule for stripped photos: throws unless `onDisk` (bytes
 * read back from the file) is exactly `expected` and carries no metadata or
 * location. Used by every writer of stripped photos.
 */
export function assertStrippedCopy(onDisk: Uint8Array, expected: Uint8Array): void {
  const same = onDisk.length === expected.length && onDisk.every((byte, i) => byte === expected[i]);
  if (!same) throw new Error('the stripped JPEG was not written correctly');
  if (!isMetadataFree(findJpegMetadata(onDisk)) || hasLocationMetadata(onDisk)) {
    throw new Error('photo metadata is still present after stripping');
  }
}
