import {campaignEnabled} from './campaign-policy.js';
export const BONDS=[
 {id:'peach',title:'도원결의',ids:['hero-001','hero-004','hero-005'],need:2,protect:1,description:'두 명 이상 함께 참전 · 승리 시 전사 예정 D4 1명 보호'},
 {id:'redcliff',title:'적벽의 호흡',ids:['hero-016','hero-037'],need:2,attack:2,description:'주유·황개 함께 공격 · 최종 공격 +2'},
 {id:'jiangdong',title:'강동의 방패',ids:['hero-003','hero-040'],need:2,defense:2,description:'손권·주태 함께 수비 · 최종 수비 +2'},
 {id:'guan',title:'관문의 계승',ids:['hero-033','hero-034'],need:2,attack:1,description:'관평·관흥 함께 공격 · 최종 공격 +1'},
 {id:'zhang',title:'연인의 기개',ids:['hero-005','hero-035'],need:2,defense:1,description:'장비·장포 함께 수비 · 최종 수비 +1'},
 {id:'court',title:'패업의 보좌',ids:['hero-002','hero-066'],need:2,economic:true,description:'조조·순욱 같은 도시, 한 명이 내정 담당 · 정규 충원 5회마다 D4 1명 추가'}
];
export function battleBond(s,units,attack,at){if(!campaignEnabled(s))return null;return BONDS.find(b=>!b.economic&&(b.protect||b[attack?'attack':'defense'])&&b.ids.filter(id=>units.some(u=>u.heroId===id&&u.readyAt<=at)).length>=b.need)||null;}
export function economicBond(t,at){const b=BONDS.at(-1);return b.ids.every(id=>t.units.some(u=>u.heroId===id&&u.readyAt<=at))&&t.units.some(u=>u.id===t.roles.governor&&b.ids.includes(u.heroId))?b:null;}
export function bondBonus(s,t,at){if(!campaignEnabled(s))return false;const b=economicBond(t,at);if(!b){delete t.bondState;return false;}t.bondState??={count:0,members:t.units.filter(u=>b.ids.includes(u.heroId)).map(u=>u.id).sort().join('|')};const members=t.units.filter(u=>b.ids.includes(u.heroId)).map(u=>u.id).sort().join('|');if(t.bondState.members!==members)t.bondState={count:0,members};return ++t.bondState.count%5===0;}
export function reconcileBonds(s,at){if(!campaignEnabled(s))return;for(const t of Object.values(s.territories))if(!economicBond(t,at))delete t.bondState;}
