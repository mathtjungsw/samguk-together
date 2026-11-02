export const FIRST_CAMPAIGN_SEASON=5;
export const campaignEnabled=s=>s?.season?.campaignVersion===1;
export const CAPTIVE={first:1800000,step:600000,deadline:7200000,chance:.1,capture:.2,ransom:{6:4,8:8,12:14},persuade:{6:6,8:12,12:20},success:{6:.4,8:.25,12:.15}};
export const nextPersuadeAt=p=>Math.max(p.at+CAPTIVE.first,(p.lastPersuadeAt||0)+(p.lastPersuadeAt?CAPTIVE.step:0));
export const persuadeCost=p=>CAPTIVE.persuade[p.unit.sides]+(p.unit.enhanceLevel||0);
export const nextEscapeAt=p=>Math.min(p.at+CAPTIVE.deadline,p.at+CAPTIVE.first+(p.escapeRound||0)*CAPTIVE.step);
