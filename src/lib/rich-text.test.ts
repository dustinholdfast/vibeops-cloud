import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeHttpUrl, parseInline, parseRichText, toggleChecklistLine } from './rich-text';

describe('rich text', () => {
  it('parses bold, code, and safe links', () => {
    const tokens = parseInline('See **bold** and `code` plus [docs](https://example.com)');
    assert.deepEqual(
      tokens.map((t) => t.type),
      ['text', 'bold', 'text', 'code', 'text', 'link']
    );
    const link = tokens.find((t) => t.type === 'link');
    assert.equal(link && link.type === 'link' ? link.href : '', 'https://example.com');
  });

  it('rejects javascript urls', () => {
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    const tokens = parseInline('[x](javascript:alert(1))');
    assert.equal(tokens.some((t) => t.type === 'link'), false);
  });

  it('parses checklist lines', () => {
    const blocks = parseRichText('- [ ] ship it\n- [x] already done\nplain');
    assert.equal(blocks[0]?.type, 'checklist');
    assert.equal(blocks[1]?.type, 'checklist');
    assert.equal(blocks[0]?.type === 'checklist' && blocks[0].checked, false);
    assert.equal(blocks[1]?.type === 'checklist' && blocks[1].checked, true);
    assert.equal(blocks[2]?.type, 'p');
  });

  it('toggles a checklist line via setNextAction-shaped text', () => {
    const start = 'Today:\n- [ ] write tests\n- [x] ship';
    const after = toggleChecklistLine(start, 1);
    assert.equal(after, 'Today:\n- [x] write tests\n- [x] ship');
    const back = toggleChecklistLine(after, 1);
    assert.equal(back, start);
    assert.equal(toggleChecklistLine(start, 0), start);
  });
});
