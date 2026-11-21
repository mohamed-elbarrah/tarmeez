import { SallaCallbackDto } from './salla-callback.dto.js';
import { ValidationPipe } from '../../../common/pipes/validation.pipe.js';

describe('SallaCallbackDto', () => {
  it('accepts the scope returned by Salla after authorization', async () => {
    const pipe = new ValidationPipe();

    await expect(
      pipe.transform(
        { code: 'authorization-code', scope: 'offline_access', state: 'state' },
        { type: 'query', metatype: SallaCallbackDto, data: '' },
      ),
    ).resolves.toMatchObject({
      code: 'authorization-code',
      scope: 'offline_access',
      state: 'state',
    });
  });
});
