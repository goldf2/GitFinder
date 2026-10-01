const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('../src/renderer/scripts/workbenchPortfolioModel');
const task=(id,sourceStatus='ready',extra={})=>({key:`P:${id}`,taskId:id,projectId:'P',projectName:'Store',title:id,sourceStatus,status:sourceStatus,isLeaf:true,priority:'P1',...extra});
test('all queues use one scoped task list and distinguish waiting, delivery and deferred',()=>{
 const tasks=[task('A'),task('B','blocked',{blockers:['Need input']}),task('C','verified'),task('D','delivered',{completed:true}),task('E','deferred'),task('F','in_progress',{overdue:true}),task('PARENT','ready',{isLeaf:false})];
 const s=Model.scope({tasks},{queue:'open'});assert.deepEqual(s.counts,{all:6,open:4,next:2,blocked:1,review:1,overdue:1,completed:1,deferred:1});assert.equal(s.tasks[0].taskId,'F');
});
test('unmet and unavailable predecessors prevent recommending a task as ready',()=>{
 const a=task('A','in_progress'),b=task('B','ready',{predecessors:[{taskKey:'P:A'}]}),c=task('C','ready',{predecessors:[{taskKey:'missing'}]});
 assert.equal(Model.scope({tasks:[a,b,c]},{queue:'next'}).tasks.length,1);
 a.sourceStatus='delivered';a.completed=true;assert.deepEqual(Model.scope({tasks:[a,b,c]},{queue:'next'}).tasks.map(t=>t.taskId),['B']);
});
test('search and project scope affect every count but dependencies use the complete portfolio',()=>{
 const a=task('A','in_progress'),b=task('B','ready',{predecessors:[{taskKey:'P:A'}]}),other=task('Z','ready',{projectId:'Q',projectName:'Other'});
 const result=Model.scope({tasks:[a,b,other]},{projectId:'P',query:'B',queue:'blocked'});assert.equal(result.counts.all,1);assert.equal(result.counts.blocked,1);assert.equal(result.counts.next,0);
});
