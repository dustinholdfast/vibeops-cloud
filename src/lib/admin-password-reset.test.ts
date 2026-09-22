import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectError } from './project-validation';
import { consumePasswordReset, sendAdminPasswordReset } from './admin-password-reset';

describe('admin password reset guards', () => {
  it('rejects a missing target user id before talking to Clerk', async () => {
    await assert.rejects(
      () => sendAdminPasswordReset({ actorUserId: 'user_admin', targetUserId: '  ', appUrl: 'https://noxencloud.com' }),
      (error: unknown) => error instanceof ProjectError && error.status === 400
    );
  });

  it('rejects a missing target on consume', async () => {
    await assert.rejects(
      () => consumePasswordReset({ userId: '', token: 'aa'.repeat(32), password: 'correct1' }),
      (error: unknown) => error instanceof ProjectError && error.status === 400
    );
  });
});
