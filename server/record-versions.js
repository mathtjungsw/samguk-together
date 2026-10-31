import {createHash} from 'node:crypto';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const recordHash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const recordManifest=s=>({revision:s.revision,battles:Object.fromEntries(Object.entries(s.history||{}).filter(([,e])=>e.result).map(([id,e])=>[id,recordHash(e)])),...(s.season?.result?{archive:recordHash(s.season.result)}:{})});
