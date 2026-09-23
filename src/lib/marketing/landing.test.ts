import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSE_MS_PER_CHAR,
  COMPOSE_PAUSE_MS,
  LANDING_COPY,
  LANDING_META,
  PREVIEW_LOOP_MS,
  PREVIEW_SCENES,
  composeProgress,
  previewClock,
} from './landing';

function firstScreenText(): string {
  return [
    LANDING_COPY.eyebrow,
    LANDING_COPY.headline,
    LANDING_COPY.subhead,
    LANDING_COPY.freeNote,
    ...LANDING_COPY.tiles.flatMap((tile) => [tile.title, tile.body]),
    LANDING_COPY.previewCaption,
  ].join('\n');
}

describe('landing copy', () => {
  it('leads with the daily job, not a sync slogan', () => {
    assert.match(LANDING_COPY.headline, /deserves today/i);
    assert.match(LANDING_COPY.subhead, /builders/i);
    assert.match(LANDING_COPY.subhead, /Now slots/i);
  });

  it('does not name Nox on the first screen', () => {
    assert.equal(/\bnox\b/i.test(firstScreenText()), false);
  });

  it('frames tiles as outcomes', () => {
    assert.equal(LANDING_COPY.tiles.length, 3);
    for (const tile of LANDING_COPY.tiles) {
      assert.ok(tile.body.length > 20);
    }
  });

  it('sets a specific title and description', () => {
    assert.match(LANDING_META.title, /Noxen Cloud/);
    assert.match(LANDING_META.description, /daily brief/i);
  });
});

describe('preview clock', () => {
  it('starts on the portfolio scene', () => {
    assert.equal(previewClock(0).scene.id, 'portfolio');
    assert.equal(previewClock(0).elapsedInScene, 0);
  });

  it('advances into compose, then brief, then wraps', () => {
    const composeAt = PREVIEW_SCENES[0].durationMs;
    const briefAt = composeAt + PREVIEW_SCENES[1].durationMs;
    assert.equal(previewClock(composeAt).scene.id, 'compose');
    assert.equal(previewClock(briefAt).scene.id, 'brief');
    assert.equal(previewClock(PREVIEW_LOOP_MS).scene.id, 'portfolio');
    assert.equal(previewClock(-1).scene.id, 'brief');
  });

  it('keeps a rotting project in view the whole loop', () => {
    for (const scene of PREVIEW_SCENES) {
      assert.equal(scene.attention.name, 'Docs site');
      assert.match(scene.attention.detail, /quiet/);
    }
  });

  it('fills the third Now slot only after compose', () => {
    const before = PREVIEW_SCENES.find((scene) => scene.id === 'portfolio');
    const after = PREVIEW_SCENES.find((scene) => scene.id === 'brief');
    assert.ok(before && after);
    assert.equal('empty' in before.now[2], true);
    assert.equal('empty' in after.now[2], false);
    if (!('empty' in after.now[2])) {
      assert.equal(after.now[2].name, 'Status page');
    }
  });
});

describe('compose typing', () => {
  const compose = { name: 'Status page', nextAction: 'Write the incident banner' };

  it('types the name, then the next action', () => {
    assert.deepEqual(composeProgress(0, compose), { name: '', nextAction: '', phase: 'name' });
    assert.equal(composeProgress(COMPOSE_MS_PER_CHAR * 6, compose).name, 'Status');
    assert.equal(composeProgress(COMPOSE_MS_PER_CHAR * compose.name.length, compose).phase, 'action');
    const midAction = COMPOSE_MS_PER_CHAR * compose.name.length + COMPOSE_PAUSE_MS + COMPOSE_MS_PER_CHAR * 5;
    const typed = composeProgress(midAction, compose);
    assert.equal(typed.name, compose.name);
    assert.equal(typed.nextAction, 'Write');
    assert.equal(typed.phase, 'action');
  });

  it('finishes both fields', () => {
    const doneAt =
      COMPOSE_MS_PER_CHAR * compose.name.length +
      COMPOSE_PAUSE_MS +
      COMPOSE_MS_PER_CHAR * compose.nextAction.length;
    assert.deepEqual(composeProgress(doneAt, compose), {
      name: compose.name,
      nextAction: compose.nextAction,
      phase: 'done',
    });
  });
});
