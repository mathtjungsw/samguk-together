import ROSTER from './data/hero-effects-next.json' with {type:'json'};
import PEOPLE from './data/ai-names.json' with {type:'json'};
// Founding rulers of Chinese/Korean history. Per-person provenance lives in data.
// Founding legends are labelled separately in the data; no Yellow Turban names.
const CANDIDATES=PEOPLE.map(p=>p.name);
export const aiNamePool=()=>CANDIDATES.filter(name=>!ROSTER.some(e=>e.name===name));
export function chooseAiName(s,uid,serial){const active=new Set(Object.values(s.territories).map(t=>t.owner).filter(Boolean)),used=new Set(Object.values(s.players).filter(p=>p.uid!==uid&&(p.kind!=='ai'||active.has(p.uid))).map(p=>p.name)),pool=aiNamePool();if(!pool.length)throw Error('AI 이름 후보가 없습니다.');const ordered=pool.slice(serial%pool.length).concat(pool.slice(0,serial%pool.length));for(let suffix=1;;suffix++)for(const base of ordered){const name='AI'+base+(suffix===1?'':suffix);if(!used.has(name))return name;}}
