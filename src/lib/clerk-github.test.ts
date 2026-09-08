import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clerkGitHubStrategy, clerkSocialStrategies } from './clerk-github';

describe('clerk GitHub strategy', () => {
  it('prefers oauth_github when present', () => {
    const clerk = {
      client: {
        environment: {
          userSettings: {
            authenticatableSocialStrategies: ['oauth_google', 'oauth_github'],
          },
        },
      },
    };
    assert.equal(clerkGitHubStrategy(clerk), 'oauth_github');
  });

  it('accepts a custom GitHub strategy', () => {
    const clerk = {
      client: {
        environment: {
          userSettings: {
            social: {
              oauth_custom_github: { enabled: true, authenticatable: true, strategy: 'oauth_custom_github' },
            },
          },
        },
      },
    };
    assert.equal(clerkGitHubStrategy(clerk), 'oauth_custom_github');
  });

  it('returns null when GitHub is not enabled for sign-in', () => {
    const clerk = {
      client: {
        environment: {
          userSettings: {
            social: {
              oauth_github: { enabled: true, authenticatable: false, strategy: 'oauth_github' },
              oauth_google: { enabled: true, authenticatable: true, strategy: 'oauth_google' },
            },
          },
        },
      },
    };
    assert.equal(clerkGitHubStrategy(clerk), null);
    assert.deepEqual(clerkSocialStrategies(clerk), ['oauth_google']);
  });
});
