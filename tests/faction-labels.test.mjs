import test from 'node:test';
import assert from 'node:assert/strict';
import {representativeFactions,factionSignature,layoutFactionLabels,containsPoint,interiorPoint,polygonArea,boxesOverlap} from '../src/faction-labels.js';
import {MAP} from '../src/engine.js';
import {softenedSegment} from '../src/map-geometry.js';

const cell=(id,x,y,area=100)=>({id,anchor:[x,y],area});
const world=(owners,names={a:'정승원',b:'AI왕건'})=>({season:{id:'season-5'},players:Object.fromEntries(Object.entries(names).map(([uid,name])=>[uid,{uid,name}])),territories:Object.fromEntries(Object.entries(owners).map(([id,owner])=>[id,{id,owner,units:[]}]))});
const neighbors=links=>id=>links[id]||[];
const faction=(uid,name,x,y)=>({uid,name,count:1,representative:uid,cells:[cell(uid,x,y)]});

test('faction representative belongs to its largest connected cluster, never the mean between separated lands',()=>{
  const cells=[cell('a1',20,30),cell('a2',50,30),cell('a3',80,30),cell('far',800,900),cell('b1',120,30)];
  const s=world({a1:'a',a2:'a',a3:'a',far:'a',b1:'b'}),before=JSON.stringify(s);
  const rows=representativeFactions(s,cells,neighbors({a1:['a2'],a2:['a1','a3'],a3:['a2']}));
  assert.equal(rows.length,2);assert.equal(rows.find(p=>p.uid==='a').representative,'a2');assert.equal(rows.find(p=>p.uid==='a').count,4);assert.equal(JSON.stringify(s),before);
});
test('single-land factions, AI and absent owner profiles do not create neutral or duplicate labels',()=>{
  const cells=['a','b','neutral','missing'].map((id,i)=>cell(id,50*i,50));
  const rows=representativeFactions(world({a:'a',b:'b',neutral:'',missing:'unknown'}),cells,neighbors({}));
  assert.deepEqual(rows.map(r=>[r.uid,r.name,r.representative]),[['a','정승원','a'],['b','AI왕건','b']]);
});
test('cluster and representative ties have stable ordering, then prefer larger area',()=>{
  const cells=[cell('a1',0,0,80),cell('a2',20,0,120),cell('z1',400,400),cell('z2',420,400)],s=world(Object.fromEntries(cells.map(c=>[c.id,'a'])));
  const graph=neighbors({a1:['a2'],a2:['a1'],z1:['z2'],z2:['z1']});
  assert.equal(representativeFactions(s,cells,graph)[0].representative,'a2');
  assert.equal(representativeFactions(s,[...cells].reverse(),graph)[0].representative,'a2');
});
test('an interior anchor handles concave cells, exterior city coordinates and polygon boundaries',()=>{
  const polygon=[[0,0],[40,0],[40,10],[10,10],[10,40],[0,40]],anchor=interiorPoint(polygon,[30,30]);
  assert.ok(containsPoint(polygon,anchor));assert.ok(!containsPoint(polygon,[30,30]));assert.ok(containsPoint(polygon,[0,0]));assert.equal(polygonArea(polygon),700);
  assert.deepEqual(interiorPoint(polygon,[5,5]),[5,5]);
});
test('all actual softened map cells can produce an anchor inside their existing territory',()=>{
  for(const c of MAP.layout.cells){const polygon=c.polygon.flatMap((p,i)=>softenedSegment(p,c.polygon[(i+1)%c.polygon.length]).slice(0,-1));
    const anchor=interiorPoint(polygon,[1e6,1e6]);assert.ok(containsPoint(polygon,anchor),c.id);assert.ok(polygonArea(polygon)>0,c.id);
  }
});
test('troop, readiness and chat updates reuse representation; rename, capture and season changes invalidate it',()=>{
  const cells=[cell('one',30,40)],s=world({one:'a'}),signature=factionSignature(s,cells);
  s.territories.one.units=[{id:'new',readyAt:9999}];s.players.a.kills=40;s.chat={text:'대화'};s.updatedAt=1000;
  assert.equal(factionSignature(s,cells),signature);
  s.players.a.name='새 이름';assert.notEqual(factionSignature(s,cells),signature);s.players.a.name='정승원';s.territories.one.owner='b';assert.notEqual(factionSignature(s,cells),signature);s.territories.one.owner='a';s.season.id='season-6';assert.notEqual(factionSignature(s,cells),signature);
});
test('a faction uses one in-view fallback and retains it until its canonical city is visible again',()=>{
  const f={uid:'a',name:'정승원',count:3,representative:'home',cells:[cell('home',-50,50),cell('near',180,180),cell('edge',60,120)]};
  let out=layoutFactionLabels([f],c=>c.anchor,{width:360,height:400});assert.equal(out.placements.length,1);assert.equal(out.placements[0].cellId,'near');
  f.cells[2].anchor=[181,181];out=layoutFactionLabels([f],c=>c.anchor,{width:360,height:400,previous:out.fallbacks});assert.equal(out.placements[0].cellId,'near');
  f.cells[0].anchor=[30,50];out=layoutFactionLabels([f],c=>c.anchor,{width:360,height:400,previous:out.fallbacks});assert.equal(out.placements[0].cellId,'home');
  assert.equal(layoutFactionLabels([f],c=>[c.anchor[0]-1000,c.anchor[1]],{width:360,height:400}).placements.length,0);
});
test('labels avoid selected-city boxes, each other and viewport clipping',()=>{
  const blocked=[{x:90,y:90,w:100,h:25}],factions=[faction('a','정승원',140,130),faction('b','AI왕건',180,155),faction('c','김현성(본)',270,100)];
  const out=layoutFactionLabels(factions,c=>c.anchor,{width:360,height:300,uid:'a',blocked}),visible=out.placements.filter(p=>!p.hidden);
  assert.ok(visible.length>=2);
  for(const p of visible){assert.ok(p.box.x>=4&&p.box.y>=4&&p.box.x+p.box.w<=356&&p.box.y+p.box.h<=296);assert.ok(!boxesOverlap(p.box,blocked[0]));}
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)assert.ok(!boxesOverlap(visible[i].box,visible[j].box));
});
test('long Korean and emoji names keep full identity while fitting in one or two readable lines',()=>{
  for(const name of ['대한민국함께천하최강군주이름','김현성(본)','AI왕건','가족👨‍👩‍👧‍👦군주','<script>군주</script>']){
    const [p]=layoutFactionLabels([faction('a',name,190,190)],c=>c.anchor,{width:390,height:400}).placements;
    assert.ok(!p.hidden);assert.equal(p.name,name);assert.ok(p.lines.length<=2);assert.ok(p.fontSize>=13);assert.ok(p.box.x+p.box.w<=386);
  }
});
test('crowded views allocate own and highlighted faction first and retain a marker for hidden names',()=>{
  const factions=Array.from({length:12},(_,i)=>faction('p'+i,'군주'+i,130,130));
  const out=layoutFactionLabels(factions,c=>c.anchor,{width:260,height:260,uid:'p11',highlight:'p9'});
  assert.equal(out.placements[0].uid,'p11');assert.equal(out.placements[0].hidden,false);assert.equal(out.placements[1].uid,'p9');
  assert.ok(out.placements.some(p=>p.hidden));assert.equal(out.placements.length,12);assert.equal(new Set(out.placements.map(p=>p.uid)).size,12);
  for(const p of out.placements.filter(p=>p.hidden)){assert.deepEqual(p.anchor,[130,130]);assert.deepEqual(p.lines,[]);}
});
test('a name blocked at the overview scale is restored when zoom separates the anchors',()=>{
  const factions=Array.from({length:12},(_,i)=>faction('p'+i,'군주'+i,300+(i%4)*6,200+Math.floor(i/4)*6));
  const crowded=layoutFactionLabels(factions,c=>c.anchor,{width:900,height:700});
  const expanded=layoutFactionLabels(factions,c=>[80+(c.anchor[0]-300)*25,120+(c.anchor[1]-200)*25],{width:900,height:700});
  assert.ok(expanded.placements.filter(p=>!p.hidden).length>crowded.placements.filter(p=>!p.hidden).length);
  assert.equal(expanded.placements.filter(p=>!p.hidden).length,12);
});
