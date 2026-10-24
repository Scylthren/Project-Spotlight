/**
 * What the Style and Results screens say (Gate 3 slice 2): the examples, the
 * data notice, request checks, and the words for every failure. Plain data,
 * tested; screens only show it.
 */
import { normalizeOutfitText, OUTFIT_REQUEST_MAX_LENGTH, type OutfitBasePiece } from '@/ai/generate-outfits-contract';
import type { OutfitFailure } from '@/ai/outfit-generator';

/** The "Try" chips under the field; a tap fills the field with the text. */
export const STYLE_EXAMPLES = ['For summer', 'Emo vibes', 'First date', 'Job interview', 'Rainy day'] as const;

/** The data notice under "Get looks" (approved 2026-10-24, exact text). */
export const STYLE_DATA_NOTICE =
  "Your request and your pieces' names and tags (not photos) are sent to our server and to Claude (Anthropic) to suggest looks.";

/** Longest request, in characters (code points) after trimming and collapsing whitespace. */
export const STYLE_REQUEST_MAX_LENGTH = OUTFIT_REQUEST_MAX_LENGTH;

/** Characters the request counts (code points of the normalized text). */
export function styleRequestLength(text: string): number {
  return [...normalizeOutfitText(text)].length;
}

/** "12/200": the counter under the field. */
export function styleRequestCounter(text: string): string {
  return `${styleRequestLength(text)}/${STYLE_REQUEST_MAX_LENGTH}`;
}

export type StyleRequestCheck = { ok: true; request: string } | { ok: false; reason: 'empty' | 'too-long' };

/** Whether "Get looks" can send the text: 1 to 200 characters after trimming. */
export function checkStyleRequest(text: string): StyleRequestCheck {
  const request = normalizeOutfitText(text);
  if (request.length === 0) return { ok: false, reason: 'empty' };
  if ([...request].length > STYLE_REQUEST_MAX_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, request };
}

/** The field's error for a request that cannot be sent, or undefined. Empty text only disables the button. */
export function styleRequestError(text: string): string | undefined {
  const check = checkStyleRequest(text);
  return !check.ok && check.reason === 'too-long' ? `Keep it to ${STYLE_REQUEST_MAX_LENGTH} characters.` : undefined;
}

/** The Results title: the request in quotes. */
export function quotedRequest(request: string): string {
  return `“${request}”`;
}

/** Why a request has no looks: a generator failure, or the closet could not be read. */
export type StyleFailure = OutfitFailure | 'closet-unavailable';

/** What the Results screen offers after a failure. */
export type StyleFailureAction = 'retry' | 'add-piece' | 'edit-request' | 'none';

export interface StyleFailureView {
  title: string;
  body: string;
  action: StyleFailureAction;
}

/** "a top and a bottom", "a top", "a bottom": what would complete a pair. */
export function missingPairText(missing: readonly OutfitBasePiece[]): string {
  const needsTop = missing.includes('top');
  const needsBottom = missing.includes('bottom');
  if (needsTop && needsBottom) return 'a top and a bottom';
  if (needsTop) return 'a top';
  if (needsBottom) return 'a bottom';
  return 'a top and a bottom';
}

export function describeStyleFailure(failure: StyleFailure, missing: readonly OutfitBasePiece[] = []): StyleFailureView {
  switch (failure) {
    case 'not-enough-items':
      return { title: 'Not enough pieces', body: `Add ${missingPairText(missing)}, or a dress, to get looks.`, action: 'add-piece' };
    case 'offline':
      return { title: "You're offline", body: 'Check your connection, then try again.', action: 'retry' };
    case 'timeout':
      return { title: 'That took too long', body: "The server didn't answer in time. Try again.", action: 'retry' };
    case 'no-token':
      return {
        title: 'Not connected',
        body: 'This build needs the development token. Add it on the Me tab, then try again.',
        action: 'retry',
      };
    case 'unauthorized':
      return {
        title: 'Not connected',
        body: "The server didn't accept the development token. Check it on the Me tab, then try again.",
        action: 'retry',
      };
    case 'not-configured':
      return { title: 'Not set up', body: "This build has no server address, so it can't suggest looks.", action: 'none' };
    case 'rejected':
      return { title: "That request can't be sent", body: 'Try shorter or different words.', action: 'edit-request' };
    case 'closet-unavailable':
      return { title: "Couldn't read your closet", body: 'Try again in a moment.', action: 'retry' };
    case 'cancelled':
      return { title: 'Cancelled', body: 'No looks were requested.', action: 'retry' };
    case 'server':
    case 'invalid-response':
      return { title: 'Something went wrong', body: 'The server had a problem. Try again in a moment.', action: 'retry' };
  }
}

/** The answer had no looks. */
export const NO_LOOKS_VIEW: StyleFailureView = {
  title: 'No looks this time',
  body: 'Try again, or ask in different words.',
  action: 'retry',
};

/** Every look dropped out because its pieces were deleted. */
export const LOOKS_REMOVED_VIEW: StyleFailureView = {
  title: 'No looks left',
  body: 'The pieces in these looks were removed from your closet.',
  action: 'edit-request',
};

/** A restyle that found nothing new. */
export const NO_OTHER_LOOKS_TEXT = 'No other looks for this request';

/** The short line under a look whose restyle failed (the look stays as it was). */
export function restyleFailureText(failure: StyleFailure): string {
  switch (failure) {
    case 'offline':
      return "Couldn't restyle: you're offline.";
    case 'timeout':
      return "Couldn't restyle: no answer in time.";
    case 'no-token':
    case 'unauthorized':
    case 'not-configured':
      return "Couldn't restyle: not connected.";
    case 'not-enough-items':
      return "Couldn't restyle: not enough pieces.";
    default:
      return "Couldn't restyle. Try again.";
  }
}
