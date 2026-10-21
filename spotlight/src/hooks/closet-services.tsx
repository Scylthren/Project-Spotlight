import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { ClosetRepository } from '@/data/closet-repository';
import { ExpoImageProcessor } from '@/data/expo-image-processor';
import { ExpoImageStore } from '@/data/expo-image-store';
import { ExpoPhotoPicker } from '@/data/expo-photo-picker';
import { ExpoTemporaryFiles } from '@/data/expo-temporary-files';
import { asSqlDatabase } from '@/data/expo-sqlite-database';
import type { ImageProcessor } from '@/data/image-processor';
import type { ImageStore } from '@/data/image-store';
import type { PhotoPicker } from '@/data/photo-picker';
import { SqliteClosetRepository } from '@/data/sqlite-closet-repository';
import type { TemporaryFiles } from '@/data/temporary-files';

export interface ClosetServices {
  repository: ClosetRepository;
  imageStore: ImageStore;
  imageProcessor: ImageProcessor;
  photoPicker: PhotoPicker;
  temporaryFiles: TemporaryFiles;
}

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
    }),
    [db],
  );
  return <ClosetServicesContext value={services}>{children}</ClosetServicesContext>;
}

export function useClosetServices(): ClosetServices {
  const services = useContext(ClosetServicesContext);
  if (!services) throw new Error('useClosetServices must be used inside ClosetServicesProvider');
  return services;
}
