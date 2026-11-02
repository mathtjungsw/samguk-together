import {compactPaths} from './record-color-rules.mjs';import {FIRST_ENHANCEMENT_SEASON} from '../src/enhancement-policy.js';
export function enhancementRules(root){const w=root.rules.worlds.$world,p=w.players.$uid;
 if(!w.season)return root; // Historical test-season rules have no numbered-season policy.
 for(const node of [w,p,w.season])node['.validate']='('+node['.validate']+')';
 w.season.enhancementVersion={'.validate':`newData.val()==1&&newData.parent().child('number').val()>=${FIRST_ENHANCEMENT_SEASON}`};w.season.aiAttackVersion={'.validate':`newData.val()==2&&newData.parent().child('number').val()>=${FIRST_ENHANCEMENT_SEASON}`};
 w.season['.validate']+=`&&(newData.child('number').val()<${FIRST_ENHANCEMENT_SEASON}?!newData.child('enhancementVersion').exists()&&!newData.child('aiAttackVersion').exists():newData.child('enhancementVersion').val()==1&&newData.child('aiAttackVersion').val()==2)`;
 w.command.enhancementProtocol={'.validate':'newData.val()==1'};w['.validate']+="&&(!newData.child('season/enhancementVersion').exists()||newData.child('command/enhancementProtocol').val()==1)&&newData.hasChild('enhancementLedger')==data.hasChild('enhancementLedger')";
 w.enhancementLedger={'.validate':'newData.isString()&&newData.val()==data.val()'};
 for(const key of ['enhanceSeq','enhancementDeaths']){p[key]={'.validate':'newData.isNumber()&&newData.val()>=0&&newData.val()%1==0&&newData.val()==data.val()'};p['.validate']+=`&&newData.hasChild('${key}')==data.hasChild('${key}')`;}
 for(const [kind,u]of [['territory',w.territories.$tid.units.$slot],['queue',w.returnQueues.$uid.units.$slot]]){
  const world="root.child('worlds').child($world)",c="newData.parent().parent().parent().parent().child('command')",here=kind==='territory'?`${world}.child('territories').child($tid).child('units').child($slot)`:`${world}.child('returnQueues').child($uid).child('units').child($slot)`,origin=`${c}.child('origins').child(newData.child('id').val())`,source=`(${origin}.child('kind').val()=='queue'?${world}.child('returnQueues').child(${origin}.child('owner').val()).child('units').child(''+${origin}.child('slot').val()):${world}.child('territories').child(${origin}.child('territoryId').val()).child('units').child(''+${origin}.child('slot').val()))`;
  const same=old=>`${old}.child('id').val()==newData.child('id').val()&&${old}.child('enhanceLevel').val()==newData.child('enhanceLevel').val()&&${old}.child('enhanceFailures').val()==newData.child('enhanceFailures').val()`;
  u['.validate']=`(${u['.validate']})&&((${same(here)})||(${origin}.exists()&&${same(source)})||(${here}.child('id').val()!=newData.child('id').val()&&!${origin}.exists()&&!newData.hasChild('enhanceLevel')&&!newData.hasChild('enhanceFailures')))`;
  u.enhanceLevel={'.validate':'newData.isNumber()&&newData.val()>=0&&newData.val()<=3&&newData.val()%1==0'};u.enhanceFailures={'.validate':'newData.isNumber()&&newData.val()>=0&&newData.val()<8&&newData.val()%1==0'};
 }
 return compactPaths(root);
}
