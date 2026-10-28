import {fixture as legacyFixture,hero,soldier,T} from './v3-helpers.mjs';
import {upgradeWorld,applyCommand,refreshIndexes,reconcileRoles} from '../src/engine-v4.js';
export {hero,soldier,T};
let serial=0;
export const command=(s,uid,type,fields={},at=s.updatedAt)=>applyCommand(s,uid,{id:`v4-test-${++serial}`,type,baseRevision:s.revision,at,...fields});
export function fixture(options={}){const f=legacyFixture(options);f.s=upgradeWorld(f.s,f.s.updatedAt);return f;}
export function restamp(s,at=s.updatedAt){for(const t of Object.values(s.territories))for(const u of t.units){u.createdAt??=at;u.moveReadyAt??=0;u.arrivedAt??=at;u.stationTerritoryId=t.id;}for(const [uid,q] of Object.entries(s.returnQueues||{})){for(const u of q.units){u.createdAt??=at;u.arrivedAt??=at;u.stationTerritoryId='';}s.players[uid].retreatCostD4??=0;}reconcileRoles(s,at);refreshIndexes(s);return s;}
