import { FakeClosetTagger } from '@/ai/closet-tagger';
import { NoGarmentIsolator } from '@/data/garment-isolator';
import { FakeImageProcessor } from '@/data/image-processor';
import { ImportSessions } from '@/data/import-session';
import { InMemoryClosetRepository } from '@/data/in-memory-closet-repository';
import { MemoryImageStore } from '@/data/memory-image-store';
import { QueuedMultiPhotoPicker, QueuedPhotoPicker } from '@/data/photo-picker';
import { RecordingTemporaryFiles } from '@/data/temporary-files';

import type { ClosetServices } from './closet-services';
import { createTaggingServices } from './tagging-services';
import { importSessionDeps } from './use-import-entry';

describe('importSessionDeps', () => {
  it('gives the import the same tagger, image preparation, color detection and add-flow services as the item form', () => {
    const imageProcessor = new FakeImageProcessor();
    const tagging = createTaggingServices(imageProcessor, new FakeClosetTagger());
    const services = {
      repository: new InMemoryClosetRepository(),
      imageStore: new MemoryImageStore(),
      imageProcessor,
      photoPicker: new QueuedPhotoPicker(),
      multiPhotoPicker: new QueuedMultiPhotoPicker(),
      importSessions: new ImportSessions(),
      temporaryFiles: new RecordingTemporaryFiles(),
      garmentIsolator: new NoGarmentIsolator(),
      ...tagging,
    } as unknown as ClosetServices;
    const deps = importSessionDeps(services);
    expect(deps.tagger).toBe(tagging.closetTagger);
    expect(deps.imageSource).toBe(tagging.tagImageSource);
    expect(deps.isolator).toBe(services.garmentIsolator);
    expect(deps.addItem).toEqual({
      repository: services.repository,
      imageStore: services.imageStore,
      imageProcessor,
      temporaryFiles: services.temporaryFiles,
    });
  });
});
