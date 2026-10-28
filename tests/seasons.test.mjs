import test from 'node:test';
import assert from 'node:assert/strict';
import {TEST_END,SEASON1_START,seasonPhase,activeWorld,worldWritable,archiveTestSeason,archiveMapWorld} from '../src/seasons.js';
import {fixture} from './v4-helpers.mjs';
import {createWorld} from '../src/engine.js';
test('시즌 종료·개막 정확한 한국시간 경계',()=>{assert.equal(new Date(TEST_END).toISOString(),'2026-10-28T02:00:00.000Z');assert.equal(seasonPhase(TEST_END-1),'test');assert.equal(seasonPhase(TEST_END),'break');assert.equal(seasonPhase(SEASON1_START-1),'break');assert.equal(seasonPhase(SEASON1_START),'season1');assert.equal(activeWorld(SEASON1_START),'season-1');assert.ok(!worldWritable('main',TEST_END));assert.ok(!worldWritable('season-1',SEASON1_START-1));assert.ok(worldWritable('season-1',SEASON1_START));});
test('지난 역사에는 랭킹·지도만 남고 과거 원본은 수정하지 않음',()=>{const f=fixture({at:TEST_END-60000}),before=structuredClone(f.s),a=archiveTestSeason(f.s);assert.deepEqual(f.s,before);assert.equal(a.territories.length,90);assert.ok(a.rankings.every(p=>!('uid'in p)));assert.ok(!('history'in a));assert.ok(!('chat'in a));assert.ok(!('units'in a.territories[0]));const view=archiveMapWorld(a);assert.equal(Object.keys(view.territories).length,90);assert.deepEqual(archiveTestSeason(f.s),a);});
test('Firebase가 빈 대기열과 빈 배열을 생략한 저장본도 같은 최종 기록을 표시',()=>{
 const f=fixture({at:TEST_END-60000}),expected=archiveTestSeason(f.s);
 const strip=value=>{if(!value||typeof value!=='object')return value;const out=Array.isArray(value)?value.map(strip):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,strip(v)]).filter(([,v])=>v!==undefined));return Object.keys(out).length?out:undefined;};
 const saved=strip(f.s),before=structuredClone(saved);assert.equal(saved.returnQueues,undefined);assert.equal(saved.pendingBattles,undefined);
 assert.deepEqual(archiveTestSeason(saved),expected);assert.deepEqual(saved,before);
});
test('시즌 1 초기 전장은 이전 군주·영토·병력·채팅을 참조하지 않음',()=>{const s=createWorld(SEASON1_START,'season-1');assert.equal(s.featureVersion,5);assert.equal(Object.keys(s.players).length,0);assert.ok(Object.values(s.territories).every(t=>t.owner===''));assert.ok(Object.values(s.territories).flatMap(t=>t.units).every(u=>u.sides===4));assert.equal(Object.keys(s.history).length,0);});
