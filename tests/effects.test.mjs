import test from 'node:test';
import assert from 'node:assert/strict';
import {MINUTE,RULES,refreshIndexes,projectWorld,capacityOf,adjacent,livingUnits} from '../src/engine-v4.js';
import {EFFECTS,economy,regularRecruitBonus,evaluateBattle,moveTiming,newEffectState} from '../src/hero-effects.js';
import {T,hero,soldier,fixture,command} from './v3-helpers.mjs';
const covered=new Set();
const named=n=>hero(EFFECTS[n-1].name);
const d4=(n,prefix='d')=>Array.from({length:n},(_,i)=>soldier(prefix+i));

for(const e of EFFECTS.filter(e=>e.economic))test(`${e.name}(${e.number}) 내정 발동과 미지정 불발`,()=>{covered.add(e.number);const n=e.number,u=named(n),f=fixture({attack:[u,soldier('stay')],owner:'a'}),{s,from,to}=f,t=s.territories[from];t.roles.governor=u.id;t.roles.governorSince=T-30*MINUTE;t.roles.support=to;refreshIndexes(s);let active,target=t;
  if([1,49,92].includes(n)){const cycle={1:3,49:6,92:10}[n];u.effectState.recruits=cycle-2;assert.equal(regularRecruitBonus(s,t,T),null);assert.equal(regularRecruitBonus(s,t,T+1)?.id,u.id);}
  else if(n===86){t.roles.governorSince=T;assert.equal(regularRecruitBonus(s,t,T+59*MINUTE),null);assert.equal(regularRecruitBonus(s,t,T+60*MINUTE)?.id,u.id);assert.equal(regularRecruitBonus(s,t,T+61*MINUTE),null);}
  else if(n===81){t.roles.governorSince=T;const before=projectWorld(s,T+29*MINUTE),after=projectWorld(s,T+30*MINUTE);assert.ok(!before.territories[from].units.some(x=>x.id.includes('mizhu')));assert.equal(after.territories[from].units.filter(x=>x.id.includes('mizhu')).length,1);}
  else if(n===90){const troops=d4(3,'incoming');const timing=moveTiming(s,s.territories[to],t,troops,T,'');assert.equal(timing.delays.incoming0,8*MINUTE);}
  else {if(n===48&&s.territories[from].id==='luoyang')assert.ok(true);if([71,85].includes(n))target=s.territories[to];active=economy(s,target,T);if([2,48,52,85].includes(n))assert.equal(active.interval,({2:8,48:9,52:9.5,85:9.5}[n])*MINUTE);else if([3,47,53,94].includes(n))assert.equal(active.capacity,capacityOf(target.id)+({3:3,47:2,53:1,94:1}[n]));else {const field=n===74?2:1;assert.equal(active.probabilities[field],n===13?1100:n===54?900:n===74?300:800);}}
  t.roles.governor='';assert.equal(regularRecruitBonus(s,t,T+100*MINUTE),null);if(active){const off=economy(s,target,T);assert.equal(off.capacity,capacityOf(target.id));assert.equal(off.interval,10*MINUTE);assert.deepEqual(off.probabilities,[9000,700,250,50]);}
});

for(const e of EFFECTS.filter(e=>e.movement))test(`${e.name}(${e.number}) 기동 담당과 미지정`,()=>{covered.add(e.number);const u=named(e.number),troops=[u,...d4(3,'walking')],{s,from,to}=fixture({attack:[...troops,soldier('stay')],owner:'a'}),returning=[soldier('reverse')];const timing=moveTiming(s,s.territories[from],s.territories[to],troops,T,u.id,returning),off=moveTiming(s,s.territories[from],s.territories[to],troops,T,'',returning);assert.ok(Object.values(timing.delays).some(n=>n<10*MINUTE)||timing.sourceDelay<10*MINUTE||timing.returnDelays.reverse<10*MINUTE);assert.ok(Object.values(off.delays).every(n=>n===10*MINUTE));assert.equal(off.sourceDelay,10*MINUTE);assert.equal(off.returnDelays.reverse,10*MINUTE);if(e.number===80){assert.equal(timing.returnDelays.reverse,8*MINUTE);assert.equal(moveTiming(s,s.territories[from],s.territories[to],troops,T+1,u.id,returning).returnDelays.reverse,10*MINUTE);}});

const flats={4:[2,2],5:[2,3],7:[5,5],10:[2,4],17:[3,4],20:[3,4],21:[3,4],23:[3,4],26:[3,4],28:[3,4],30:[3,4],31:[2,4],32:[3,4],38:[3,4],42:[3,4],44:[5,4],45:[3,4],51:[5,4],55:[3,4],56:[2,4],58:[5,4],60:[3,4],61:[4,2],63:[3,4],64:[4,4],68:[4,4],69:[3,4],72:[3,4],75:[6,4],76:[3,4],96:[3,4]};
for(const e of EFFECTS.filter(e=>e.battle&&!e.afterBattle))test(`${e.name}(${e.number}) 전투 특기 선택 발동과 해제`,()=>{covered.add(e.number);const n=e.number,u=named(n),defense=e.defense&&!e.attack||[19,65,70,87].includes(n);let [ownCount,enemyCount]=flats[n]||[4,4];let own=[u,...d4(ownCount-1,'own')],enemy=d4(enemyCount,'enemy');
  if(n===4)enemy[0]=soldier('enemy-officer',6);
  if([12,42,72].includes(n))own[1]=soldier('own-ruler',20);
  if([38,55].includes(n))own[1]=soldier('own-officer',6);
  if(n===69)enemy[0]=soldier('enemy-general',12);
  if(n===79)own[1]=hero('관우');
  if(n===24)own=[u,...d4(4,'own')];
  if(n===58)own=[u,...d4(4,'own')];
  if(n===73)own=[u,...d4(20,'own')];
  if([19,65,70].includes(n))enemy=[hero('관우'),...d4(n===70?5:3,'enemy')];
  if(n===87)enemy=[hero('반장'),...d4(3,'enemy')];
  const {s,from,to}=fixture({attack:defense?enemy:own,defend:defense?own:enemy,owner:[45,60].includes(n)?'':'b'}),t=s.territories[defense?to:from];
  t.roles.defense=[u.id];t.roles.defenseSince=T-30*MINUTE;if(n===32){u.effectState.lastAttackAt=T-10*MINUTE;u.effectState.lastAttackWon=true;}if(n===34)u.effectState.attacks=2;if(n===91)u.effectState.wins=4;
  if([21,98,87].includes(n)){const others=adjacent(to).filter(id=>id!==from);assert.ok(others.length);s.territories[others[0]].owner='a';}
  const low=[8,9,12,18,24,29,34,35,39,62,67,78,79,91,95,99].includes(n),ownRolls=own.map((x,i)=>n===96&&i===0?6:low?1:Math.min(4,x.sides)),enemyRolls=enemy.map(x=>Math.min(4,x.sides));
  const args={s,from,to,attackUnits:defense?enemy:own,defendUnits:defense?own:enemy,at:T,seed:0,attackIds:defense?([19,65,70,87].includes(n)?[enemy[0].id]:[]):[u.id],defenseIds:defense?[u.id]:[],rolls:{attack:defense?enemyRolls:ownRolls,defense:defense?ownRolls:enemyRolls}};
  const control={...args,attackIds:defense?args.attackIds:[],defenseIds:defense?[]:args.defenseIds};
  let actual,base;for(let seed=0;seed<40;seed++){actual=evaluateBattle({...args,seed});base=evaluateBattle({...control,seed});if(actual.attack.score!==base.attack.score||actual.defense.score!==base.defense.score)break;}
  assert.ok(actual.attack.score!==base.attack.score||actual.defense.score!==base.defense.score,`${n}: effect never changed a score`);
  for(const result of [actual.attack,actual.defense]){assert.ok(result.bonus<=10&&result.penalty<=6&&result.score>=1);for(const die of result.dice)assert.ok(die.roll>=1&&die.roll<=die.sides);}
  u.readyAt=T+1;const inactive=evaluateBattle(args),without=evaluateBattle(control);assert.equal(inactive.attack.score,without.attack.score);assert.equal(inactive.defense.score,without.defense.score);
});

function afterFixture(n){const u=named(n),survive=[6,40,50,77].includes(n),guard=[11,27,33].includes(n),defense=[41,57].includes(n),target=n===33?hero('관우'):soldier('guarded-ruler',20);let attack,defend;
 if(survive)attack=[soldier('stay'),u,...d4(3,'a')];else if(guard)attack=[soldier('stay'),u,target,...d4(3,'a')];else if(defense)attack=[soldier('stay'),...d4(2,'a')];else attack=[soldier('stay'),u,soldier('low'),...Array.from({length:6},(_,i)=>soldier('heavy'+i,12))];
 if(survive||guard)defend=Array.from({length:10},(_,i)=>soldier('heavy-def'+i,12));else if(defense)defend=[u,soldier('low-def'),...Array.from({length:6},(_,i)=>soldier('heavy-def'+i,12))];else defend=d4(2,'enemy');
 const f=fixture({attack,defend,owner:[84,89].includes(n)?'':'b'});if(defense)f.s.territories[f.to].roles.defense=[u.id];refreshIndexes(f.s);return {...f,u,survive,guard,defense,target};}
for(const e of EFFECTS.filter(e=>e.afterBattle))test(`${e.name}(${e.number}) 승패 후 특기 발동과 미선택`,()=>{covered.add(e.number);const n=e.number,f=afterFixture(n),{s,from,to,u}=f,ids=s.territories[from].units.slice(1).map(u=>u.id),run=(base,seed,enabled)=>command(base,'a','move',{from,to,unitIds:ids,attackHeroIds:enabled&&!f.defense?[u.id]:[],seed,guardTargetId:f.target.id});let positive;
 for(let seed=0;seed<200;seed++){const x=run(s,seed,true),r=x.history[x.command.id].result;const ok=f.survive?r.escaped.some(x=>x.unit.id===u.id):f.guard?r.escaped.some(x=>x.unit.id===f.target.id):f.defense?r.defendDead.length===0:[36].includes(n)?r.attackDead.length===0:[25,59].includes(n)?x.territories[from].actionReadyAt<T+10*MINUTE:x.territories[to].units.some(x=>x.id.startsWith('bonus:'));if(ok){positive={x,r,seed};break;}}
 assert.ok(positive,`${n}: no positive after-battle example`);const off=structuredClone(s);if(f.defense)off.territories[to].roles.defense=[];const negative=run(off,positive.seed,false),r=negative.history[negative.command.id].result;
 if(f.survive||f.guard)assert.equal(r.escaped.length,0);else if(f.defense)assert.equal(r.defendDead.length,1);else if(n===36)assert.equal(r.attackDead.length,1);else if([25,59].includes(n))assert.equal(negative.territories[from].actionReadyAt,T+10*MINUTE);else assert.ok(!negative.territories[to].units.some(x=>x.id.startsWith('bonus:')));
});

test('공통 상한·동점·조건부 불발·재굴림 중복 방지',()=>{const a=[hero('장비'),hero('장료')],{s,from,to}=fixture({attack:d4(6,'a'),defend:a});s.territories[to].roles.defense=a.map(u=>u.id);const r=evaluateBattle({s,from,to,attackUnits:s.territories[from].units,defendUnits:a,at:T,rolls:{attack:[1,1,1,1,1,1],defense:[1,1]}});assert.equal(r.defense.bonus,10);const equal=evaluateBattle({s,from,to,attackUnits:[soldier('a')],defendUnits:[soldier('b')],at:T,rolls:{attack:[1],defense:[1]}});assert.equal(equal.attack.score,equal.defense.score);const z=[hero('제갈량'),hero('순유'),...d4(3,'a')],f=fixture({attack:z,defend:d4(3,'b')});const mixed=evaluateBattle({s:f.s,from:f.from,to:f.to,attackUnits:z,defendUnits:f.s.territories[f.to].units,attackIds:['제갈량','순유'],at:T,seed:2,rolls:{attack:[1,1,1,1,1],defense:[1,1,1]}});assert.ok(mixed.attack.bonus<=10);});
test('100명 모두 발동/불발 검증 범위에 포함된다',()=>assert.deepEqual([...covered].sort((a,b)=>a-b),Array.from({length:100},(_,i)=>i+1)));
