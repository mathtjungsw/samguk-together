import test from 'node:test';import assert from 'node:assert/strict';
import {recruitmentFixture} from './recruitment-helpers.mjs';
import {createSeasonWorld} from '../src/seasons.js';
import {unitTier,normalizeWorld,settleRecruitment,refreshIndexes,movementPlan,adjacent} from '../src/engine-next.js';
import {recruitmentV2,recruitmentWeights,recruitmentText} from '../src/recruitment-policy.js';
import {economy,effectOf,newEffectState} from '../src/hero-effects-next.js';
import {rosterFor} from '../src/hero-catalog.js';
import {rosterSummary,rosterSummaryHTML} from '../src/field-ui.js';
import {armyCounts} from '../src/season-policy.js';
import {officerDetailHTML} from '../src/officer-ui.js';
import {stampUnit} from '../src/role-policy.js';
import {applyEnhancement,defaultEnhancementMaterials} from '../src/enhancement-actions.js';
import {captureDefeated} from '../src/campaign-core.js';
test('season5 remains legacy; season6 and later get pinned policy; absent marker never silently upgrades',()=>{
 for(const n of [5,6,7]){const s=createSeasonWorld(n,Date.now(),'policy');assert.equal(recruitmentV2(s),n>=6);assert.deepEqual(recruitmentWeights(normalizeWorld(s)),n>=6?[9000,700,220,80]:[9000,700,250,50]);}
 const s=createSeasonWorld(6,Date.now(),'unmarked');delete s.season.recruitmentVersion;assert.equal(recruitmentV2(normalizeWorld(s)),false);
 s.season.recruitmentVersion=99;assert.throws(()=>normalizeWorld(s),/충원 정책/);s.season.recruitmentVersion=2;s.season.number=5;assert.throws(()=>normalizeWorld(s),/충원 정책/);
});
test('all10000 probability buckets including boundaries have exact new counts',()=>{
 const s=createSeasonWorld(6,0,'weights'),w=recruitmentWeights(s),counts={4:0,6:0,8:0,12:0};for(let i=0;i<10000;i++)counts[unitTier((i+.5)/10000,w)]++;
 assert.deepEqual(counts,{4:9000,6:700,8:220,12:80});for(const [n,tier]of [[0,4],[8999,4],[9000,6],[9699,6],[9700,8],[9919,8],[9920,12],[9999,12]])assert.equal(unitTier((n+.5)/10000,w),tier);
 assert.equal(unitTier(.993,recruitmentWeights(createSeasonWorld(5,0,'old'))),8);assert.equal(unitTier(.993,w),12);
});
test('economic probability bonuses preserve their increments and total under both policies',()=>{
 for(const version of [5,6])for(const [number,bonus,index]of [[13,200,1],[74,50,2]]){
  const {s,t,at}=recruitmentFixture(version),e=rosterFor(s).find(e=>e.number===number);t.units=[stampUnit({id:'governor',name:e.name,sides:e.sides,heroId:e.id,heroVersion:3,effectState:newEffectState(),readyAt:0},at,t.id)];t.roles={governor:'governor',governorSince:0};const base=recruitmentWeights(s),p=economy(s,t,at).probabilities;assert.equal(p[index],base[index]+bonus);assert.equal(p[0],base[0]-bonus);assert.equal(p[3],base[3]);assert.equal(p.reduce((a,b)=>a+b),10000);
 }
});
test('exhausted D6 is unnamed only in new season, while exhausted D8/D12 remain D4',()=>{
 for(const number of [5,6])for(const tier of [6,8,12]){const {s,t,due}=recruitmentFixture(number,tier),before=structuredClone(s),news=settleRecruitment(s,due),u=t.units.at(-1);assert.equal(u.sides,number===6&&tier===6?6:4);assert.equal(u.heroId,undefined);assert.equal(u.name,u.sides===6?'이름 없는 부장':'병사');assert.deepEqual(s.heroIndex,before.heroIndex);assert.doesNotThrow(()=>normalizeWorld(s));const snapshot=structuredClone(s);assert.deepEqual(settleRecruitment(s,due),[]);assert.deepEqual(s,snapshot);if(u.sides===6){assert.equal(u.legacy,true);assert.equal(news.filter(e=>e.unit.id===u.id).length,1);assert.ok(!news.at(-1).text.includes('부장 이름 없는'));}}
});
test('last D6 is awarded once across same-time cities; death frees the named candidate',()=>{
 const {s,active,due}=recruitmentFixture(6,6,{remaining:1,targets:2});settleRecruitment(s,due);const us=active.map(t=>t.units.at(-1));assert.equal(us.filter(u=>u.heroId).length,1);assert.equal(us.filter(u=>u.legacy).length,1);assert.doesNotThrow(()=>normalizeWorld(s));
 const named=us.find(u=>u.heroId),city=active.find(t=>t.units.includes(named));city.units=city.units.filter(u=>u!==named);refreshIndexes(s);assert.ok(!s.heroIndex[named.heroId]);
 const f=recruitmentFixture(6,6,{remaining:1});settleRecruitment(f.s,f.due);assert.equal(f.t.units.at(-1).heroId,named.heroId);
});
test('unnamed D6 counts as owned officer but never as a unique hero and has no portrait/effect/capture',()=>{
 const {s,t,due}=recruitmentFixture();settleRecruitment(s,due);const u=t.units.at(-1);assert.equal(effectOf(u),undefined);assert.equal(rosterSummary(s).reduce((n,r)=>n+r.total,0),200);assert.equal(rosterSummary(s).find(r=>r.sides===6).live,110);assert.equal(armyCounts(s,'a').tiers[6],111);assert.ok(rosterSummaryHTML(s).includes('당첨 시 이름 없는 D6 부장 충원'));
 const html=officerDetailHTML(s,'a',u.id,due,'',false);assert.ok(html.includes('고유 효과 없음'));assert.ok(html.includes('고유 특기 없이'));assert.ok(html.includes('portrait-fallback'));assert.equal(captureDefeated(s,'a','a',[u],new Set(),due,{seed:'no-capture',id:'synthetic'}),null);
 assert.ok(recruitmentText(s).includes('2.2%'));assert.ok(recruitmentText(createSeasonWorld(5,due,'old')).includes('2.5%'));
});
test('unnamed D6 retains independent move/occupied-city exchange and enhancement target/booster support',()=>{
 const {s,t,due}=recruitmentFixture();settleRecruitment(s,due);const u=t.units.at(-1),to=adjacent(t.id)[0],dest=s.territories[to];dest.owner='a';dest.units=Array.from({length:12},(_,i)=>stampUnit({id:'dest-'+i,name:'병사',sides:4,readyAt:due+600000},due,to));dest.actionReadyAt=due+600000;t.actionReadyAt=due+600000;assert.equal(movementPlan(s,'a',t.id,to,[u.id],due).error,undefined);
 while(t.units.length<10)t.units.push(stampUnit({id:'material-'+t.units.length,name:'병사',sides:4,readyAt:due+600000},due,t.id));refreshIndexes(s);const request={id:'enhance-unnamed-target',seq:0,city:t.id,unitId:u.id,materialIds:defaultEnhancementMaterials(t,u.id,due)};const out=applyEnhancement(s,'a',request,due,0);assert.equal(out.result.success,true);assert.equal(out.world.territories[t.id].units.find(x=>x.id===u.id).enhanceLevel,1);
 const target=t.units[0],b=applyEnhancement(s,'a',{...request,id:'enhance-unnamed-booster',unitId:target.id,materialIds:defaultEnhancementMaterials(t,target.id,due,u.id),boosterId:u.id},due,0);assert.equal(b.result.chance,.9);assert.ok(!b.world.territories[t.id].units.some(x=>x.id===u.id));
});
