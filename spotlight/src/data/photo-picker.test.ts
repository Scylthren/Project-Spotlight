import { describePickProblem, QueuedPhotoPicker } from './photo-picker';

describe('QueuedPhotoPicker', () => {
  it('returns queued results in order, then cancelled, and records each source', async () => {
    const photo = { uri: 'file:///cache/a.jpg', width: 10, height: 20 };
    const picker = new QueuedPhotoPicker([
      { status: 'picked', photo },
      { status: 'permission-denied', canAskAgain: false },
    ]);
    expect(await picker.pick('camera')).toEqual({ status: 'picked', photo });
    expect(await picker.pick('camera')).toEqual({ status: 'permission-denied', canAskAgain: false });
    expect(await picker.pick('library')).toEqual({ status: 'cancelled' });
    expect(picker.calls).toEqual(['camera', 'camera', 'library']);
  });
});

describe('describePickProblem', () => {
  it('reports nothing for a picked photo or a cancel', () => {
    const photo = { uri: 'file:///a.jpg', width: 1, height: 1 };
    expect(describePickProblem({ status: 'picked', photo }, 'camera')).toBeNull();
    expect(describePickProblem({ status: 'cancelled' }, 'camera')).toBeNull();
    expect(describePickProblem({ status: 'cancelled' }, 'library')).toBeNull();
  });

  it('points to Settings when camera access is permanently denied', () => {
    expect(describePickProblem({ status: 'permission-denied', canAskAgain: false }, 'camera')).toEqual({
      message: 'Spotlight is not allowed to use your camera. You can turn on access for Spotlight in Settings.',
      suggestSettings: true,
    });
  });

  it('asks the user to allow access when the prompt can be shown again', () => {
    expect(describePickProblem({ status: 'permission-denied', canAskAgain: true }, 'camera')).toEqual({
      message: 'Spotlight needs access to your camera for this. Try again and choose Allow.',
      suggestSettings: false,
    });
    expect(describePickProblem({ status: 'permission-denied', canAskAgain: false }, 'library')?.message).toMatch(
      /your photos/,
    );
  });

  it('names the source in error messages', () => {
    expect(describePickProblem({ status: 'error', message: 'Camera not available' }, 'camera')).toEqual({
      message: 'Could not open the camera: Camera not available',
      suggestSettings: false,
    });
    expect(describePickProblem({ status: 'error', message: 'boom' }, 'library')).toEqual({
      message: 'Could not open your photos: boom',
      suggestSettings: false,
    });
  });
});
