import {FIRST_CAMPAIGN_SEASON} from '../src/campaign-policy.js';
export function campaignRules(root){const w=root.rules.worlds.$world;if(!w.season)return root;
 const lower=FIRST_CAMPAIGN_SEASON,cutoff=new RegExp('^season-('+Array.from({length:10-lower},(_,i)=>i+lower).join('|')+'|[1-9][0-9]+)$');
 w['.write']='('+w['.write']+')&&!$world.matches(/'+cutoff.source+'/)&&!data.child("season/campaignVersion").exists()';
 root.rules.battleRecords={'.read':"auth!=null&&auth.token.firebase.sign_in_provider=='google.com'",'.write':false};
 root.rules.enhancementRecords={'.read':false,'.write':false};
 root.rules.serverOptimizations={'.read':false,'.write':false};
 root.rules.privateMissions={'$world':{'$uid':{'.read':false,'.write':false}}};return root;
}
