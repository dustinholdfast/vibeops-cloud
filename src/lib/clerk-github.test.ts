import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clerkGitHubStrategy, clerkSocialStrategies } from './clerk-github';

describe('clerk GitHub strategy', () => {
  it('reads environment from the Clerk object, not client', () => {
    const clerk = {
      environment: {
        userSettings: {
          authenticatableSocialStrategies: ['oauth_google', 'oauth_github'],
        },
      },
    };
    assert.equal(clerkGitHubStrategy(clerk), 'oauth_github');
    assert.deepEqual(clerkSocialStrategies(clerk), ['oauth_google', 'oauth_github']);
  });

  it('accepts a custom GitHub strategy', () => {
    const clerk = {
      environment: {
        userSettings: {
          social: {
            oauth_custom_github: {
              enabled: true,
              authenticatable: true,
              strategy: 'oauth_custom_github',
            },
          },
        },
      },
    };
    assert.equal(clerkGitHubStrategy(clerk), 'oauth_custom_github');
  });

  it('falls back to oauth_github when the environment is not on the client', () => {
    const clerk = { client: { signIn: {} } };
    assert.equal(clerkGitHubStrategy(clerk), 'oauth_github');
    assert.deepEqual(clerkSocialStrategies(clerk), []);
  });
});
