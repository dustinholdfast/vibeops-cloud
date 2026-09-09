import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectError } from './project-validation';

describe('admin delete guards', () => {
  it('rejects deleting the signed-in admin', async () => {
    const { adminDeleteUser } = await import('./admin-delete-user');
    await assert.rejects(
      () => adminDeleteUser('user_admin', 'user_admin'),
      (error: unknown) => error instanceof ProjectError && error.status === 400
    );
  });
});
