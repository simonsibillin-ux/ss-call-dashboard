/* Price edits preserve existing agreed totals, including legacy adjustments. */
(function(root){
  const money=value=>{const n=Number(value),abs=Math.abs(n);return (n<0?-1:1)*Math.round((abs+Number.EPSILON*Math.max(1,abs))*100)/100||0;};
  function itemsFromRecord(record={}){
    const raw=Array.isArray(record.items)?record.items:[];
    if(!raw.length)return [{description:record.service||'Service',qty:1,unit:'',rate:Number(record.revenue)||0}];
    const items=raw.map(item=>{
      const qty=Number(item.qty)>0?Number(item.qty):1;
      const total=item.total!==undefined&&item.total!==null?Number(item.total):null;
      const rate=total!==null&&Number.isFinite(total)?total/qty:(Number(item.rate)||0)*(Number(item.multiplier)||1);
      return {description:item.description||item.name||'Service',qty,unit:item.unit||'',rate:Math.round(rate*1000000)/1000000};
    });
    const sum=money(items.reduce((sum,i)=>sum+money(i.qty*i.rate),0));
    const agreed=Number(record.revenue);
    if(Number.isFinite(agreed)&&Math.abs(money(agreed-sum))>=0.01)items.push({description:'Price adjustment',qty:1,unit:'',rate:money(agreed-sum)});
    return items;
  }
  function validate(items){
    if(!Array.isArray(items)||!items.length||items.length>50)throw Error('Use between 1 and 50 service items.');
    const result=items.map(item=>{
      const description=String(item.description||'').trim(),qty=Number(item.qty),rate=Number(item.rate);
      if(!description)throw Error('Every item needs a description.');
      if(item.qty===''||item.rate===''||!Number.isFinite(qty)||!Number.isFinite(rate)||qty<=0||qty>1000000||Math.abs(rate)>10000000)throw Error('Enter valid quantities and unit prices.');
      return {description,qty,rate,unit:String(item.unit||'').trim(),total:money(qty*rate)};
    });
    const total=money(result.reduce((sum,item)=>sum+item.total,0));
    if(total<0)throw Error('Job total cannot be negative.');
    return {items:result,total};
  }
  const api={money,itemsFromRecord,validate};
  if(typeof module!=='undefined')module.exports=api;else root.JobEditRules=api;
})(typeof window==='undefined'?globalThis:window);
