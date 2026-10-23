/**
 * Prepares an eval photo the way the app prepares the front photo before
 * tagging (`UploadTagImageSource` + `ExpoImageProcessor.prepareForUpload`):
 * upright, JPEG at the app's quality, long edge at most 1024 px (never
 * upscaled), metadata stripped with the app's `core/jpeg-metadata` code and
 * checked again on the exact bytes; anything left (Exif, GPS, XMP, ...) and
 * the photo is refused, never sent.
 *
 * Decoding and resizing use macOS's built-in `sips` (reads HEIC, PNG, JPEG;
 * no npm dependency), through an injected `exec` so Jest can test the
 * argument building without running it. Platform-specific dev tooling:
 * the runner needs macOS.
 *
 * Plain TypeScript with no Node APIs.
 */
import { validateTagItemRequest, TAG_ITEM_MAX_IMAGE_BASE64_LENGTH } from '../../supabase/functions/_shared/tag-item-contract.ts';
import { encodeBase64 } from '../../spotlight/src/core/base64.ts';
import { needsDownscale } from '../../spotlight/src/core/image-size.ts';
import {
  findJpegMetadata,
  hasLocationMetadata,
  isMetadataFree,
  orientationProblem,
  stripJpegMetadata,
} from '../../spotlight/src/core/jpeg-metadata.ts';

/** The app's JPEG quality (`STORED_IMAGE_JPEG_QUALITY`; drift-tested). */
export const APP_JPEG_QUALITY = 0.8;
/** The app's long-edge limit for the tag image (`TAG_IMAGE_MAX_EDGE`; drift-tested). */
export const UPLOAD_MAX_EDGE = 1024;

export type PrepareErrorCode = 'unreadable' | 'orientation' | 'metadata_remains' | 'too_large' | 'not_sendable';

export class PrepareError extends Error {
  constructor(
    readonly code: PrepareErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PrepareError';
  }
}

export interface PreparedPhoto {
  /** Exactly the bytes whose base64 is sent. */
  bytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
}

/**
 * Strips metadata and verifies the exact result, as the app does: no
 * removable segment, no trailing data, no location, upright; then base64
 * within the contract limit and a request the contract accepts. Throws
 * PrepareError otherwise. `strip` is injectable only so a test can prove a
 * bad stripper is caught.
 */
export function stripAndVerify(
  jpeg: Uint8Array,
  size: { width: number; height: number },
  strip: (bytes: Uint8Array) => Uint8Array = stripJpegMetadata,
): PreparedPhoto {
  let bytes: Uint8Array;
  let report;
  try {
    bytes = strip(jpeg);
    report = findJpegMetadata(bytes);
  } catch (error) {
    throw new PrepareError('unreadable', `the converted JPEG could not be read (${(error as Error).message})`);
  }
  if (!isMetadataFree(report) || hasLocationMetadata(bytes)) {
    throw new PrepareError('metadata_remains', 'metadata is still present after stripping; not sending this photo');
  }
  const problem = orientationProblem(report);
  if (problem) throw new PrepareError('orientation', problem);
  const base64 = encodeBase64(bytes);
  if (base64.length > TAG_ITEM_MAX_IMAGE_BASE64_LENGTH) {
    throw new PrepareError('too_large', `the prepared photo is too large to send (${base64.length} base64 characters)`);
  }
  if (!validateTagItemRequest({ imageBase64: base64, contentType: 'image/jpeg' }).ok) {
    throw new PrepareError('not_sendable', 'the prepared photo is not a request the function accepts');
  }
  return { bytes, base64, width: size.width, height: size.height };
}

// ---------------------------------------------------------------------------
// sips

/** Runs a program; resolves its stdout; rejects on a non-zero exit. */
export type Exec = (file: string, args: string[]) => Promise<string>;

export interface SipsDeps {
  exec: Exec;
  readBytes(path: string): Promise<Uint8Array>;
  /** A fresh path in a private temporary folder, ending in `name`. */
  tempPath(name: string): string;
  remove(path: string): Promise<void>;
}

export const SIPS = '/usr/bin/sips';

export function sipsSizeArgs(path: string): string[] {
  return ['-g', 'pixelWidth', '-g', 'pixelHeight', path];
}

export function parseSipsSize(stdout: string): { width: number; height: number } {
  const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new PrepareError('unreadable', 'sips did not report the image size');
  }
  return { width, height };
}

/**
 * sips operations that turn stored pixels with Exif `orientation` upright.
 * sips copies the orientation tag but never applies it, so this does.
 * Order matters for 5 and 7 (checked against sips by the Jest sips test).
 */
export function orientationOps(orientation: number | null): string[] {
  switch (orientation) {
    case null:
    case 1:
      return [];
    case 2:
      return ['-f', 'horizontal'];
    case 3:
      return ['-r', '180'];
    case 4:
      return ['-f', 'vertical'];
    case 5:
      return ['-f', 'horizontal', '-r', '90'];
    case 6:
      return ['-r', '90'];
    case 7:
      return ['-f', 'vertical', '-r', '90'];
    case 8:
      return ['-r', '270'];
    default:
      throw new PrepareError('orientation', `unknown Exif orientation ${orientation}`);
  }
}

/** sips arguments: orientation ops, JPEG at the app's quality, downscale only when the long edge is over the limit. */
export function sipsConvertArgs(input: string, output: string, size: { width: number; height: number }, ops: readonly string[]): string[] {
  const resize = needsDownscale(size, UPLOAD_MAX_EDGE) ? ['-Z', String(UPLOAD_MAX_EDGE)] : [];
  return [...ops, '-s', 'format', 'jpeg', '-s', 'formatOptions', String(Math.round(APP_JPEG_QUALITY * 100)), ...resize, input, '--out', output];
}

/**
 * Converts any photo sips reads (HEIC, PNG, JPEG) into the JPEG the app
 * would send, then strips and verifies it (`stripAndVerify`). A first pass
 * reads the Exif orientation of the converted file; when it is not upright,
 * a second pass from the original applies the rotation, so the image is
 * encoded only once. Temporary files are always removed.
 */
export async function prepareWithSips(input: string, deps: SipsDeps): Promise<PreparedPhoto> {
  const temps: string[] = [];
  const convert = async (ops: readonly string[], size: { width: number; height: number }) => {
    const out = deps.tempPath(`prepared-${temps.length}.jpg`);
    temps.push(out);
    await deps.exec(SIPS, sipsConvertArgs(input, out, size, ops));
    return out;
  };
  try {
    let size: { width: number; height: number };
    try {
      size = parseSipsSize(await deps.exec(SIPS, sipsSizeArgs(input)));
    } catch (error) {
      if (error instanceof PrepareError) throw error;
      throw new PrepareError('unreadable', 'sips could not read this file');
    }
    let output: string;
    let bytes: Uint8Array;
    try {
      output = await convert([], size);
      bytes = await deps.readBytes(output);
    } catch {
      throw new PrepareError('unreadable', 'sips could not convert this file to JPEG');
    }
    let report;
    try {
      report = findJpegMetadata(bytes);
    } catch (error) {
      throw new PrepareError('unreadable', `sips wrote a JPEG that could not be read (${(error as Error).message})`);
    }
    if (report.exif && !report.exifReadable) throw new PrepareError('orientation', 'the Exif block cannot be read, so the orientation is unknown');
    const ops = orientationOps(report.orientation);
    if (ops.length > 0) {
      try {
        output = await convert(ops, size);
        bytes = await deps.readBytes(output);
      } catch {
        throw new PrepareError('unreadable', 'sips could not rotate this photo upright');
      }
    }
    let finalSize: { width: number; height: number };
    try {
      finalSize = parseSipsSize(await deps.exec(SIPS, sipsSizeArgs(output)));
    } catch {
      throw new PrepareError('unreadable', 'sips did not report the prepared size');
    }
    if (Math.max(finalSize.width, finalSize.height) > UPLOAD_MAX_EDGE) {
      throw new PrepareError('too_large', `the prepared photo is ${finalSize.width}x${finalSize.height}, over ${UPLOAD_MAX_EDGE} px`);
    }
    return stripAndVerify(bytes, finalSize);
  } finally {
    for (const path of temps) await deps.remove(path).catch(() => undefined);
  }
}
