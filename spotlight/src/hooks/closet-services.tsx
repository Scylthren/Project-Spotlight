import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { EntryPromptSession, type CameraPermissions } from '@/data/camera-permissions';
import type { ClosetRepository } from '@/data/closet-repository';
import { ExpoCameraPermissions } from '@/data/expo-camera-permissions';
import { ExpoImageProcessor } from '@/data/expo-image-processor';
import { ExpoImageStore } from '@/data/expo-image-store';
import { ExpoPhotoPicker } from '@/data/expo-photo-picker';
import { ExpoStoredPhotoFiles } from '@/data/expo-stored-photo-files';
import { ExpoTemporaryFiles } from '@/data/expo-temporary-files';
import { asSqlDatabase } from '@/data/expo-sqlite-database';
import type { GarmentIsolator } from '@/data/garment-isolator';
import type { ImageProcessor } from '@/data/image-processor';
import type { ImageStore } from '@/data/image-store';
import { LocalGarmentIsolator } from '@/data/local-garment-isolator';
import { SqliteMaintenanceLog } from '@/data/maintenance-log';
import { startPhotoMetadataBackfill } from '@/data/photo-metadata-backfill';
import type { PhotoPicker } from '@/data/photo-picker';
import { SqlitePhotoReferences } from '@/data/photo-references';
import { SqliteClosetRepository } from '@/data/sqlite-closet-repository';
import type { TemporaryFiles } from '@/data/temporary-files';

export interface ClosetServices {
  repository: ClosetRepository;
  imageStore: ImageStore;
  imageProcessor: ImageProcessor;
  photoPicker: PhotoPicker;
  temporaryFiles: TemporaryFiles;
  /** Finds the garment in a photo; used for color detection (slice 4). */
  garmentIsolator: GarmentIsolator;
  /** Camera permission checks and prompts (slice 5). */
  cameraPermissions: CameraPermissions;
  /** Whether the Add screen's camera prompt was already shown this app session. */
  entryPromptSession: EntryPromptSession;
}

/** One per app session (module lifetime), so remounting the provider does not show the prompt again. */
const ENTRY_PROMPT_SESSION = new EntryPromptSession();

const ClosetServicesContext = createContext<ClosetServices | null>(null);

/** Provides the real on-device services. Must be inside expo-sqlite's SQLiteProvider. */
export function ClosetServicesProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const services = useMemo<ClosetServices>(
    () => ({
      repository: new SqliteClosetRepository(asSqlDatabase(db)),
      imageStore: new ExpoImageStore(),
      imageProcessor: new ExpoImageProcessor(),
      photoPicker: new ExpoPhotoPicker(),
      temporaryFiles: new ExpoTemporaryFiles(),
      garmentIsolator: new LocalGarmentIsolator(),
      cameraPermissions: new ExpoCameraPermissions(),
      entryPromptSession: ENTRY_PROMPT_SESSION,
    }),
    [db],
  );
  // One-time cleanup of photos stored before metadata stripping. Runs in the
  // background once the database is open (this provider only renders then);
  // it never blocks the UI and retries on the next launch if anything fails.
  useEffect(() => {
    void startPhotoMetadataBackfill({
      files: new ExpoStoredPhotoFiles(),
      references: new SqlitePhotoReferences(asSqlDatabase(db)),
      log: new SqliteMaintenanceLog(asSqlDatabase(db)),
    });
  }, [db]);
  return <ClosetServicesContext value={services}>{children}</ClosetServicesContext>;
}

export function useClosetServices(): ClosetServices {
  const services = useContext(ClosetServicesContext);
  if (!services) throw new Error('useClosetServices must be used inside ClosetServicesProvider');
  return services;
}
