const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const context={_escHtml:value=>String(value),priorityCandidateDate:value=>value};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("const RECORD_NOTES_START"),source.indexOf('async function fetchRecordNotes')),context);
vm.runInContext(source.slice(source.indexOf('let _recordNotesById'),source.indexOf('let _activeRecordNoteContext')),context);
const note=(overrides={})=>({id:'one',body:'Internal context',author_name:'Simon',created_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z',...overrides});
test('historical notes have a neutral author and no invented date',()=>{
 const html=context.recordNotesTimelineHtml([note({is_historical:true})]);
 assert.ok(html.includes('Historical note'));assert.ok(!html.includes('Simon'));assert.ok(!html.includes('2026'));assert.ok(html.includes('Internal context'));
});
test('regular internal notes keep their actual author and timestamp',()=>{
 const html=context.recordNotesTimelineHtml([note()]);assert.ok(html.includes('Simon'));assert.ok(html.includes('2026'));
});
test('a dated original wins over an identical historical copy',()=>{
 const html=context.recordNotesTimelineHtml([note({id:'old',is_historical:true}),note({id:'dated'})]);
 assert.equal(html.split('Internal context').length-1,1);assert.ok(html.includes('Simon'));assert.ok(!html.includes('Historical note'));
});
test('legacy quote-note panels are not rendered alongside internal notes',()=>{
 const html=context.recordNotesTimelineHtml([note()],[{label:'Existing quote note',text:'Old separate panel'}]);assert.ok(!html.includes('Existing quote note'));assert.ok(!html.includes('Old separate panel'));
});
test('historical entries do not acquire timestamps through Calendar projections',()=>{
 assert.equal(context.recordNotesProjection('Old document note',[note({is_historical:true})]),'Old document note');
});
test('separate dated contacts with the same wording remain separate notes',()=>{
 const html=context.recordNotesTimelineHtml([note({id:'first',created_at:'2026-11-01T00:00:00Z'}),note({id:'second'})]);assert.equal(html.split('Internal context').length-1,2);
});
