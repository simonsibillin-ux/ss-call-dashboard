const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../api/follow-up-priority');

const now = new Date('2026-09-26T02:00:00Z');
const candidate = (overrides = {}) => ({
  id:'quote:test', kind:'pending_quote', clientName:'Test customer', total:2500,
  createdAt:'2026-09-01T00:00:00Z', latestActivityAt:'2026-09-26T00:00:00Z', noteEntries:[], ...overrides
});

test('a fresh voicemail enters cooldown instead of remaining urgent', () => {
  const result = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Voicemail left', outcomeCode:'voicemail_left' }] }), now);
  assert.equal(result.priority, 'medium');
  assert.equal(result.reasonCode, 'contact_cooldown');
  assert.equal(result.recommendedDate, '2026-09-29');
});

test('outbound invitations to book remain contact attempts, not buying intent', () => {
  const result = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Voice message and SMS left following up on the quote and inviting him to accept and book in.' }] }), now);
  assert.equal(result.priority, 'medium');
  assert.equal(result.reasonCode, 'contact_cooldown');
});

test('a direct instruction to contact today is urgent', () => {
  const result = _test.baseline(candidate({ kind:'unscheduled_job', noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Contact today to lock in two adjacent dates.' }] }), now);
  assert.equal(result.priority, 'urgent');
  assert.equal(result.reasonCode, 'follow_up_due');
});

test('an explicit staff follow-up date overrides customer-led contact wording', () => {
  const result = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Customer will reach out when ready. Follow up due mid October.' }] }), now);
  assert.equal(result.priority, 'upcoming');
  assert.equal(result.recommendedDate, '2026-10-15');
});

test('structured ready-to-book and explicit-date outcomes override value scoring', () => {
  assert.equal(_test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Ready', outcomeCode:'ready_to_book' }] }), now).priority, 'urgent');
  const future = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Call later', outcomeCode:'call_on_date', nextContactDate:'2026-10-10' }] }), now);
  assert.equal(future.priority, 'upcoming');
  assert.equal(future.recommendedDate, '2026-10-10');
});

test('thinking outcomes can be described as waiting without raising a false conflict', () => {
  const fallback = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Spoke — still thinking', outcomeCode:'spoke_thinking' }] }), now);
  const merged = _test.mergedResult(candidate(), fallback, { timingAssessment:'wait', reason:'Give the customer time to decide.' });
  assert.equal(fallback.reasonCode, 'decision_pending');
  assert.equal(merged.priorityConflict, false);
  assert.equal(merged.timingAssessment, 'soon');
});

test('value alone never creates urgency and suppression beats dates in free text', () => {
  const valuable = _test.baseline(candidate({ total:10000, noteEntries:[] }), now);
  assert.notEqual(valuable.priority, 'urgent');
  const suppressed = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Do not contact; old follow up was 20/9/26' }] }), now);
  assert.equal(suppressed.reasonCode, 'do_not_follow');
  assert.equal(suppressed.recommendedDate, '');
});

test('three consecutive unsuccessful attempts move to long-term review', () => {
  const notes = [1, 2, 3].map(number => ({ at:`2026-09-${27 - number}T01:00:00Z`, body:'No answer', outcomeCode:'no_answer' }));
  const result = _test.baseline(candidate({ noteEntries:notes }), now);
  assert.equal(result.priority, 'low');
  assert.equal(result.reasonCode, 'attempt_limit_reached');
});

test('daily queue is capped at ten unless genuine urgent commitments exceed capacity', () => {
  const regular = _test.assignDailyQueue(Array.from({ length:13 }, (_, index) => ({ id:String(index), priority:index < 2 ? 'urgent' : 'high', recommendedDate:'2026-09-26', opportunityScore:13 - index })));
  assert.equal(regular.filter(row => row.inDailyQueue).length, 10);
  const urgent = _test.assignDailyQueue(Array.from({ length:12 }, (_, index) => ({ id:String(index), priority:'urgent', recommendedDate:'2026-09-26', opportunityScore:index })));
  assert.equal(urgent.filter(row => row.inDailyQueue).length, 12);
});

test('structured owner handling leaves the customer-service queue', () => {
  const result = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Simon has this', outcomeCode:'owner_handling' }] }), now);
  assert.equal(result.priority, 'owner');
  assert.equal(result.reasonCode, 'owner_handling');
  assert.equal(result.recommendedDate, '');
  const [queued] = _test.assignDailyQueue([result]);
  assert.equal(queued.inDailyQueue, false);
  assert.equal(_test.deterministicTiming(result), 'wait');
  assert.equal(_test.mergedResult(candidate(), result, { timingAssessment:'no_contact' }).priorityConflict, false);
});

test('legacy owner wording also enters the owner queue', () => {
  for (const body of ['Simon will handle', 'Simon will address this', 'Simon will follow up']) {
    const result = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body }] }), now);
    assert.equal(result.priority, 'owner', body);
  }
});

test('AI cannot override deterministic timing or the recommended action', () => {
  const fallback = _test.baseline(candidate({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Waiting for the medical centre roof to be cleaned first.' }] }), now);
  const merged = _test.mergedResult(candidate(), fallback, { timingAssessment:'now', reason:'Call immediately.', recommendedAction:'Call today.' });
  assert.equal(merged.priority, 'low');
  assert.equal(merged.timingAssessment, 'wait');
  assert.equal(merged.recommendedAction, fallback.recommendedAction);
  assert.equal(merged.reason, fallback.reason);
  assert.equal(merged.priorityConflict, true);
});
