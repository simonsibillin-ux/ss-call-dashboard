const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../api/follow-up-priority');
const now = new Date('2026-09-26T02:00:00Z');
const quote = (overrides = {}) => ({ id:'quote:test', kind:'pending_quote', clientName:'Test customer', total:2500, createdAt:'2026-09-01T00:00:00Z', noteEntries:[], followUpEnabled:true, ...overrides });

test('pending quote notes cannot alter quote timing', () => {
  const result = _test.baseline(quote({ noteEntries:[{ at:'2026-09-26T01:00:00Z', body:'Do not contact. Follow up today.', outcomeCode:'do_not_contact' }], nextFollowUpAt:'2026-09-29T01:00:00Z' }), now);
  assert.equal(result.reasonCode, 'awaiting_automation');
  assert.equal(result.timingBand, 'not_scheduled');
  assert.equal(result.noteExcerpt, '');
});
test('manual follow-up is due four business days after successful CRM delivery', () => {
  const result = _test.baseline(quote({ deliveryEntries:[{ sentAt:'2026-09-18T01:00:00Z', status:'sent', channel:'sms', sequenceNumber:1 }] }), now);
  assert.equal(result.recommendedDate, '2026-09-24');
  assert.equal(result.timingBand, 'this_week');
  assert.equal(result.reasonCode, 'manual_follow_up_due');
});
test('calendar-week grouping puts Thursday 22 October in next week from Thursday 15 October', () => {
  const octoberNow = new Date('2026-10-15T02:00:00Z');
  const result = _test.baseline(quote({ sentAt:'2026-10-14T08:00:00Z', deliveryStatus:'sent', nextFollowUpAt:'2026-10-17T08:00:00Z' }), octoberNow);
  assert.equal(result.manualReviewDate, '2026-10-22');
  assert.equal(result.timingBand, 'next_week');
});
test('a manually marked-sent quote shows both the scheduled automation and manual review', () => {
  const result = _test.baseline(quote({ sentAt:'2026-09-25T01:00:00Z', deliveryStatus:'sent', nextFollowUpAt:'2026-09-28T01:00:00Z' }), now);
  assert.equal(result.automationDate, '2026-09-28');
  assert.equal(result.automationStatus, 'scheduled');
  assert.equal(result.manualReviewDate, '2026-10-02');
  assert.equal(result.timingBand, 'next_week');
});
test('a structured customer date schedules the next automation and then its manual review', () => {
  const result = _test.baseline(quote({ deliveryEntries:[{ sentAt:'2026-09-20T01:00:00Z', status:'sent' }], lastFollowUpAt:'2026-09-25T01:00:00Z', nextFollowUpAt:'2026-10-08T00:00:00Z', followUpCount:2 }), now);
  assert.equal(result.automationDate, '2026-10-08');
  assert.equal(result.automationStatus, 'scheduled');
  assert.equal(result.recommendedDate, '2026-10-14');
  assert.equal(result.timingBand, 'later');
  assert.equal(result.attemptCount, 2);
});
test('disabled quote follow-ups are not scheduled', () => {
  const result = _test.baseline(quote({ followUpEnabled:false }), now);
  assert.equal(result.reasonCode, 'follow_up_disabled');
  assert.equal(result.timingBand, 'not_scheduled');
});
test('portal call requests are immediate structured actions', () => {
  const result = _test.baseline(quote({ deliveryEntries:[{ sentAt:'2026-09-20T01:00:00Z', status:'sent' }], responseEntries:[{ createdAt:'2026-09-25T01:00:00Z', responseType:'call_request' }] }), now);
  assert.equal(result.priority, 'urgent');
  assert.equal(result.reasonCode, 'portal_call_request');
});
test('draft age alone does not create urgency but draft notes can', () => {
  assert.equal(_test.baseline(quote({ kind:'draft_quote', legacyNotes:'Pricing draft only', createdAt:'2026-01-01T00:00:00Z' }), now).reasonCode, 'draft_no_action');
  assert.equal(_test.baseline(quote({ kind:'draft_quote', legacyNotes:'Need to call customer to confirm access' }), now).reasonCode, 'draft_note_needs_review');
});
test('AI classifies unscheduled jobs but cannot redirect quote timing', () => {
  const fallback = _test.baseline(quote({ deliveryEntries:[{ sentAt:'2026-09-18T01:00:00Z', status:'sent' }] }), now);
  const mergedQuote = _test.mergedResult(quote(), fallback, { schedulingBand:'later', recommendedAction:'Ignore it' });
  assert.equal(mergedQuote.timingBand, 'this_week');
  assert.equal(mergedQuote.recommendedAction, fallback.recommendedAction);
  const job = quote({ id:'job:1', kind:'unscheduled_job' });
  assert.equal(_test.mergedResult(job, _test.baseline(job, now), { schedulingBand:'this_month' }).schedulingBand, 'this_month');
});
test('daily queue helper remains bounded for legacy callers', () => {
  const rows = _test.assignDailyQueue(Array.from({ length:13 }, (_, index) => ({ id:String(index), priority:index < 2 ? 'urgent' : 'high', recommendedDate:'2026-09-26', opportunityScore:13-index })));
  assert.equal(rows.filter(row => row.inDailyQueue).length, 10);
});
