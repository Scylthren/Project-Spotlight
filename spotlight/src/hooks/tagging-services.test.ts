/**
 * The add/edit form's tagger must never ship paired with a fake or empty
 * image source (Gate 2 slice 3). The remote tagger and the real image source
 * are created together by `createTaggingServices`; these tests pin that.
 */
import { MockClosetTagger } from '@/ai/closet-tagger';
import { RemoteClosetTagger } from '@/ai/remote-closet-tagger';
import { FakeImageProcessor } from '@/data/image-processor';
import { UploadTagImageSource } from '@/data/upload-tag-image-source';
import { joinPath, readText, REPO_ROOT, walkFiles } from '@/security/testing/node-files';

import { devBackendServices } from './dev-backend-services';
import { createTaggingServices } from './tagging-services';

const SRC = joinPath(REPO_ROOT, 'spotlight', 'src');
const isTestOnly = (file: string) => /\.test\.tsx?$/.test(file) || /(^|\/)testing\//.test(file);
const productionFiles = () => walkFiles(SRC).filter((file) => /\.tsx?$/.test(file) && !isTestOnly(file));

describe('tagging wiring', () => {
  it('pairs the session\'s remote tagger with the real image source by default', () => {
    const services = createTaggingServices(new FakeImageProcessor());
    expect(services.closetTagger).toBeInstanceOf(RemoteClosetTagger);
    expect(services.closetTagger).toBe(devBackendServices().tagger);
    expect(services.tagImageSource).toBeInstanceOf(UploadTagImageSource);
  });

  it('always uses the real image source, whatever tagger is passed', () => {
    expect(createTaggingServices(new FakeImageProcessor(), new MockClosetTagger()).tagImageSource).toBeInstanceOf(
      UploadTagImageSource,
    );
  });

  it('the app\'s services take the tagger and image source only from createTaggingServices', () => {
    const provider = readText(joinPath(SRC, 'hooks', 'closet-services.tsx'));
    expect(provider).toContain('...createTaggingServices(imageProcessor)');
    expect(provider).not.toMatch(/closetTagger\s*:\s*new\b/);
    expect(provider).not.toMatch(/tagImageSource\s*:\s*new/);
    expect(provider).not.toMatch(/MockClosetTagger|FakeClosetTagger|FixedTagImageSource/);
  });

  it('ships no placeholder or test image source, and no other TagImageSource implementation', () => {
    const implementers: string[] = [];
    for (const file of productionFiles()) {
      const text = readText(joinPath(SRC, file));
      expect(text).not.toContain('PlaceholderTagImageSource');
      expect(text).not.toContain('FixedTagImageSource');
      if (/implements\s+TagImageSource\b/.test(text)) implementers.push(file);
    }
    expect(implementers).toEqual(['data/upload-tag-image-source.ts']);
  });

  it('no production file outside the ai module uses the mock or fake tagger', () => {
    const users = productionFiles().filter(
      (file) => !file.startsWith('ai/') && /\b(MockClosetTagger|FakeClosetTagger)\b/.test(readText(joinPath(SRC, file))),
    );
    expect(users).toEqual([]);
  });
});
