import {COLORS} from './game-core.js';
export const colorSlot=p=>Number.isInteger(p?.colorSlot)?p.colorSlot:p?.color||0;
// Additional RGB values are unique and cannot collide with the original palette.
export function slotColor(slot){if(slot<COLORS.length)return COLORS[slot];let n=slot-15;const originals=new Set(COLORS.map(x=>parseInt(x.slice(1),16)));let rgb=(Math.imul(n+1,0x9e3779)&0xffffff);while(originals.has(rgb))rgb=(rgb+1)&0xffffff;return '#'+rgb.toString(16).padStart(6,'0');}
export const factionColor=(s,uid)=>s.players[uid]?.landCount===0?'#9b9b91':slotColor(colorSlot(s.players[uid]));
export function assignColor(s,uid){const slot=availableColor(s,uid);s.colorClaims??={};for(const [key,owner]of Object.entries(s.colorClaims))if(owner===uid&&key!==String(slot))delete s.colorClaims[key];s.colorClaims[slot]=uid;s.players[uid].colorSlot=slot;return slot;}
export function availableColor(s,uid){const active=new Set(Object.values(s.territories).map(t=>t.owner).filter(Boolean));const used=new Set([...active].filter(id=>id!==uid).map(id=>colorSlot(s.players[id])));let slot=0;while(used.has(slot))slot++;return slot;}
export function repairColors(s){if(s.season?.endedAt)return false;const active=new Set(Object.values(s.territories).map(t=>t.owner).filter(Boolean)),rows=[...active].map(uid=>s.players[uid]).sort((a,b)=>a.joinedAt-b.joinedAt||a.uid.localeCompare(b.uid)),reserved=new Set(),duplicates=[];let changed=false;
 for(const p of rows){const slot=colorSlot(p);if(reserved.has(slot))duplicates.push(p);else{reserved.add(slot);if(p.colorSlot!==slot){p.colorSlot=slot;changed=true;}}}
 for(const p of duplicates){let slot=0;while(reserved.has(slot))slot++;p.colorSlot=slot;reserved.add(slot);changed=true;}const claims=Object.fromEntries(rows.map(p=>[p.colorSlot,p.uid]));if(JSON.stringify(claims)!==JSON.stringify(s.colorClaims||{})){s.colorClaims=claims;changed=true;}return changed;}
