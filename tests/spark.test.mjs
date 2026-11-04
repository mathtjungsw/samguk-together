import test from 'node:test';import assert from 'node:assert/strict';
import {importSparkPending,createSparkWorld} from '../src/spark-policy.js';
import {packSparkRecords} from '../src/spark-records.js';
import {sparkReward} from '../src/spark-reward.js';
import {campaignCommand} from '../server/campaign-command.js';
import {refreshIndexes} from '../src/engine-next.js';
test('cross-project pending import preserves original draws and IDs once, scoped to user',()=>{
 const map=new Map([['samguk-enhancement-pending:old:uid:season-5:local-v1','{"draw":123}'],['samguk-campaign-pending:old:uid:season-5','{"id":"original-id","seq":7}'],['samguk-campaign-pending:old:other:season-5','private']]);const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 importSparkPending(storage,'old','new','uid');assert.equal(map.get('samguk-enhancement-pending:new:uid:season-5:local-v1'),'{"draw":123}');assert.equal(map.has('samguk-campaign-pending:new:other:season-5'),false);map.delete('samguk-campaign-pending:new:uid:season-5');importSparkPending(storage,'old','new','uid');assert.equal(map.has('samguk-campaign-pending:new:uid:season-5'),false);assert.equal(map.has('samguk-campaign-pending:old:uid:season-5'),true);
});
test('browser record packing writes details separately, keeps ledger100 refs and immutable versions',async()=>{
 const s=createSparkWorld(6,Date.now(),'records'),result={id:'enhancement-one',uid:'u',seq:0,at:s.updatedAt,success:true,level:1};s.enhancementLedger=JSON.stringify({[result.id]:result});s.history[result.id]={id:result.id,actor:'u',at:s.updatedAt,type:'enhance',enhancement:result,text:'성공'};s.history.battle={id:'battle',actor:'u',at:s.updatedAt,type:'battle',text:'전투',result:{won:true,score:4,defense:2,attack:[],defend:[]}};
 const {world,records}=await packSparkRecords(s);assert.equal(world.history.battle.result,undefined);assert.equal(world.history[result.id].enhancement,undefined);assert.equal(JSON.parse(world.enhancementLedger)[result.id].success,undefined);assert.equal(Object.keys(records).length,2);const again=await packSparkRecords(world,world);assert.equal(Object.keys(again.records).length,0);assert.deepEqual(s.history[result.id].enhancement,result);
});
test('migrated D12 ticket uses current catalog, is consumed exactly once, and preserves cooldowns',()=>{
 const at=Date.now();let s=createSparkWorld(6,at-1000,'reward');for(const type of ['register','start'])s=campaignCommand(s,'u',{id:'spark-reward-'+type,type,name:'군주'},at).world;const t=Object.values(s.territories).find(t=>t.owner==='u'),action=t.actionReadyAt;
 s.sparkTickets={u:{'reward-ticket-01':{id:'reward-ticket-01',uid:'u',tier:12,status:'available',season:'season-6'}}};const out=sparkReward(s,'u','reward-ticket-01',t.id,at,1);assert.equal(out.world.sparkTickets.u['reward-ticket-01'].status,'claimed');assert.equal(out.world.territories[t.id].actionReadyAt,action);assert.equal(out.world.territories[t.id].units.at(-1).heroVersion,3);assert.equal(sparkReward(out.world,'u','reward-ticket-01',t.id,at,9999).world.revision,out.world.revision);assert.equal(out.world.territories[t.id].units.length,t.units.length+1);
});
