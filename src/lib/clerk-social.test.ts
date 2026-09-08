import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { socialStrategiesFromEnvironment } from './clerk-social';

describe('socialStrategiesFromEnvironment', () => {
  it('reads snake_case FAPI environment payloads', () => {
    const parsed = socialStrategiesFromEnvironment({
      user_settings: {
        authenticatable_social_strategies: ['oauth_google'],
        social: {
          oauth_github: { enabled: true, authenticatable: true, strategy: 'oauth_github' },
        },
      },
    });
    assert.deepEqual(parsed.strategies.sort(), ['oauth_github', 'oauth_google']);
    assert.equal(parsed.githubStrategy, 'oauth_github');
  });

  it('returns null when GitHub is link-only', () => {
    const parsed = socialStrategiesFromEnvironment({
      user_settings: {
        social: {
          oauth_github: { enabled: true, authenticatable: false, strategy: 'oauth_github' },
        },
      },
    });
    assert.equal(parsed.githubStrategy, null);
  });
});
