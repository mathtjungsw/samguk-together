import {fixture as oldFixture,hero,soldier,T,restamp} from './v4-helpers.mjs';
import {upgradeWorld,applyCommand} from '../src/engine.js';
export {hero,soldier,T,restamp};
export function fixture(options={}){const f=oldFixture(options);f.s=upgradeWorld(f.s,f.s.updatedAt);return f;}
let serial=0;
export const command=(s,uid,type,fields={},at=s.updatedAt)=>applyCommand(s,uid,{id:`v5-helper-${++serial}`,type,baseRevision:s.revision,at,...fields});
