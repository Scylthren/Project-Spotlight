/**
 * Data layer: repositories and device services behind interfaces, each with a
 * mock and a real implementation (see closet-repository.ts, image-store.ts,
 * image-processor.ts, photo-picker.ts, temporary-files.ts). Import modules directly; this barrel stays empty so test
 * helpers and native-only modules are never pulled in by accident.
 */
export {};
