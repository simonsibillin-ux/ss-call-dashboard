const test=require('node:test');const assert=require('node:assert/strict');const rules=require('../js/job-edit-rules');
test('legacy line totals are preserved when the saved unit rate is zero',()=>{
 const items=rules.itemsFromRecord({revenue:330,items:[{description:'Stable gutters',qty:1,rate:0,total:150},{description:'Shed gutters',qty:1,rate:0,total:180}]});assert.equal(rules.validate(items).total,330);assert.equal(items[0].rate,150);
});
test('legacy multipliers become effective unit prices without double charging',()=>{
 const items=rules.itemsFromRecord({revenue:292.5,items:[{description:'Gutters',qty:65,rate:3,multiplier:1.5,total:292.5}]});assert.equal(rules.validate(items).total,292.5);assert.equal(items[0].rate,4.5);
});
test('discounted agreed job totals are represented as an explicit adjustment',()=>{
 const items=rules.itemsFromRecord({revenue:250,items:[{description:'Gutters',qty:1,rate:300,total:300}]});assert.equal(items.length,2);assert.equal(items[1].rate,-50);assert.equal(rules.validate(items).total,250);
});
test('jobs without saved line items open with their existing service and price',()=>{
 assert.deepEqual(rules.itemsFromRecord({service:'Gutter cleaning',revenue:275}),[{description:'Gutter cleaning',qty:1,unit:'',rate:275}]);
});
test('money rounding matches numeric half-cent rounding for charges and adjustments',()=>{
 assert.equal(rules.money(10.005),10.01);assert.equal(rules.money(-10.005),-10.01);assert.equal(rules.validate([{description:'Service',qty:3,rate:0.1}]).total,0.3);
});
test('invalid quantities, missing descriptions and negative job totals are rejected',()=>{
 for(const items of [[],[{description:'',qty:1,rate:100}],[{description:'Service',qty:0,rate:100}],[{description:'Service',qty:1,rate:-1}],[{description:'Service',qty:'',rate:100}]])assert.throws(()=>rules.validate(items));
});
