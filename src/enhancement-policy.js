export const FIRST_ENHANCEMENT_SEASON=5;
export const ENHANCEMENT={version:1,maxLevel:3,chances:[.8,.6,.4],failures:{4:3,6:4,8:5,12:6,20:8},costs:{4:[1,2,3],6:[2,3,4],8:[3,4,5],12:[4,5,6],20:[5,6,8]},boost:{6:.1,8:.2,12:.3}};
export const enhancementEnabled=s=>s?.season?.enhancementVersion===1&&s.season.number>=FIRST_ENHANCEMENT_SEASON;
export const levelOf=u=>u?.enhanceLevel??0;
export const failuresOf=u=>u?.enhanceFailures??0;
export const minFace=(u,enabled=true)=>enabled?1+levelOf(u):1;
export const rollDie=(u,rng,enabled=true)=>{const min=minFace(u,enabled);return min+Math.floor(rng()*(u.sides-min+1));};
export const enhanceChance=(u,booster)=>Math.min(1,Math.round(((ENHANCEMENT.chances[levelOf(u)]||0)+(ENHANCEMENT.boost[booster?.sides]||0))*100)/100);
export const enhanceCost=u=>ENHANCEMENT.costs[u.sides]?.[levelOf(u)]??0;
export function diceWinProbability(attack,defend){if(!attack.length)return 0;const dist=units=>{let out=[1];for(const u of units){const min=minFace(u),next=Array(out.length+u.sides).fill(0);for(let n=0;n<out.length;n++)for(let face=min;face<=u.sides;face++)next[n+face]+=out[n]/(u.sides-min+1);out=next;}return out;},a=dist(attack),d=dist(defend),cdf=[];let total=0;for(let i=0;i<d.length;i++){total+=d[i];cdf[i]=total;}return a.reduce((sum,p,raw)=>sum+p*(cdf[Math.min(cdf.length-1,Math.max(1,Math.floor(raw*.9))-1)]||0),0);}
