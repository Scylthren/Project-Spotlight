import { useState } from 'react';

import { IMPORT_PHOTO_LIMIT } from '@/core';
import { beginImport, type ImportSessionDeps } from '@/data/import-session';
import { describePickProblem, type PickProblem } from '@/data/photo-picker';

import { useClosetServices, type ClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useSingleFlight } from './use-single-flight';

export const IMPORT_NOTHING_READABLE = 'None of these photos could be read. Try again, or choose different photos.';

/** The import's services: the same tagger, image preparation, color detection and add flow as the item form. */
export function importSessionDeps(services: ClosetServices): ImportSessionDeps {
  const { closetTagger, tagImageSource, garmentIsolator, repository, imageStore, imageProcessor, temporaryFiles } = services;
  return {
    tagger: closetTagger,
    imageSource: tagImageSource,
    isolator: garmentIsolator,
    addItem: { repository, imageStore, imageProcessor, temporaryFiles },
    suggestOptions: { onError: (error) => console.warn('Import tag suggestion failed', error) },
    detectOptions: { onError: (error) => console.warn('Import color detection failed', error) },
  };
}

/**
 * "Import from library" on the Add screen: opens the multi-select picker
 * (at most IMPORT_PHOTO_LIMIT photos, D10), starts an import with what came
 * back, and makes it the one under review. `start` resolves true when the
 * review screen should open. A second tap while the picker is open is ignored.
 */
export function useImportEntry() {
  const services = useClosetServices();
  const guard = useSingleFlight();
  const isMounted = useIsMounted();
  const [problem, setProblem] = useState<PickProblem | null>(null);

  async function start(): Promise<boolean> {
    const started = await guard.run(async () => {
      setProblem(null);
      const result = await services.multiPhotoPicker.pickMany(IMPORT_PHOTO_LIMIT);
      if (result.status !== 'picked') {
        const pickProblem = describePickProblem(result, 'library');
        if (pickProblem && isMounted()) setProblem(pickProblem);
        return false;
      }
      const begun = await beginImport(result.photos, importSessionDeps(services));
      if (!begun) {
        if (isMounted()) setProblem({ message: IMPORT_NOTHING_READABLE, suggestSettings: false });
        return false;
      }
      if (!isMounted()) {
        // The screen closed while the picker was open: nothing to review.
        await begun.session.discard();
        return false;
      }
      services.importSessions.begin(begun.session);
      void begun.session.start();
      return true;
    });
    return started ?? false;
  }

  return { start, picking: guard.busy, problem };
}
