import {MAP} from './engine.js';
import NEXT from './data/hero-effects-next.json' with {type:'json'};
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byName=new Map(MAP.roster.map(hero=>[hero.name,hero]));
export function portraitHTML(unit,className=''){
  const extra=NEXT.find(e=>e.name===unit.name&&e.number>100);if(extra){const i=extra.number-101;return `<span class="portrait ${className}" role="img" aria-label="${escapeHTML(unit.name)} 초상" style="--portrait:url('./assets/portraits-next-50.webp');--portrait-x:${(i%10)*100/9}%;--portrait-y:${Math.floor(i/10)*25}%;background-size:1000% 500%"></span>`;}
  const hero=byName.get(unit.name),p=hero?.portrait;
  if(!p)return `<span class="portrait portrait-fallback d${unit.sides} ${className}" role="img" aria-label="${unit.sides===20?'플레이어 군주':'병력'} 표식">${unit.sides===20?'君':unit.sides===4?'兵':'將'}</span>`;
  return `<span class="portrait ${className}" role="img" aria-label="${escapeHTML(unit.name)} 초상" style="--portrait:url('./assets/portraits-${p.sheet}.webp');--portrait-x:${p.column*25}%;--portrait-y:${p.row*100/3}%"></span>`;
}
export function galleryHTML(tier=0){
  const heroes=MAP.roster.filter(h=>!tier||h.sides===tier);
  return `<div class="modal-inner hero-gallery"><div class="modal-heading"><div><p class="eyebrow">군웅백인록 · 百人錄</p><h2>천하의 무장 100인</h2><p>유비·조조·손권을 포함한 100명 · 등급은 게임을 위한 편성입니다.</p></div><button class="close-button" data-close aria-label="닫기">×</button></div><div class="gallery-filters" aria-label="무장 등급">${[[0,'전체 100'],[12,'D12 · 20명'],[8,'D8 · 30명'],[6,'D6 · 50명']].map(([n,label])=>`<button data-gallery-tier="${n}" aria-pressed="${tier===n}">${label}</button>`).join('')}</div><div class="gallery-grid">${heroes.map(h=>`<article>${portraitHTML(h)}<strong>${escapeHTML(h.name)}</strong><small>D${h.sides}</small></article>`).join('')}</div><p class="rules-footnote">초상과 등급은 게임을 위한 창작 해석입니다. D20 군주는 플레이어 본인입니다.</p></div>`;
}
