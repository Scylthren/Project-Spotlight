/**
 * AI clients behind interfaces, each with a mock and a real implementation.
 * Real implementations call our edge functions only, never an AI provider
 * directly.
 */
export * from './closet-tagger';
export * from './remote-closet-tagger';
export * from './backend-config';
export * from './connection-check';
export * from './tag-item-contract';
