import { fs } from '@modern-js/utils';
import { generateRoutes } from '../src/utils/routes';

jest.mock('@modern-js/utils', () => {
  const originalModule = jest.requireActual('@modern-js/utils');
  return {
    __esModule: true,
    ...originalModule,
    fs: {
      writeFile: jest.fn((filename: string, output: string) => ({
        filename,
        output,
      })),
    },
  };
});

describe('routes', () => {
  test('generateRoutes', async () => {
    const mockAppContext = {
      serverRoutes: [],
      distDirectory: './dist',
    };
    await generateRoutes(mockAppContext as any);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });
});
