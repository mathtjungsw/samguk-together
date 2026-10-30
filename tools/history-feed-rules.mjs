// Feed is a validated projection, never a second authority for game state.
export function historyFeedRules(root){
 const google="auth!=null&&auth.token.firebase.sign_in_provider=='google.com'";
 const source="newData.parent().parent().parent().parent().child('worlds').child($world).child('history').child($event)";
 const fields=['id','at','actor','type','text','from','to','previousOwner'];
 const event={'.validate':`${source}.exists()&&${fields.map(k=>`newData.child('${k}').val()==${source}.child('${k}').val()`).join('&&')}&&newData.child('heroMove').val()==(${source}.child('heroes').hasChildren()?true:null)&&newData.hasChild('battle')==(${source}.child('type').val()=='battle'&&${source}.hasChild('result'))`};
 for(const k of fields)event[k]={'.validate':'newData.isString()||newData.isNumber()'};
 event.heroMove={'.validate':'newData.val()==true'};
 const r=source.replace('newData.parent()','newData.parent().parent()')+".child('result')";
 const checks=['attacker','defender','won','score','defense','friendly'].map(k=>`newData.child('${k}').val()==${r}.child('${k}').val()`);
 checks.push(`newData.child('escaped').val()==${r}.child('escaped').hasChildren()`);
 for(const k of ['grade','delta'])checks.push(`newData.child('${k}').val()==${r}.child('policy').child('${k}').val()`);
 event.battle={'.validate':checks.join('&&'),'$field':{'.validate':"$field.matches(/^(attacker|defender|won|score|defense|friendly|escaped|grade|delta)$/)&&(newData.isString()||newData.isNumber()||newData.isBoolean())"}};
 event.$other={'.validate':false};
 root.rules.historyFeed={'.read':google,'$world':{'.write':`${google}&&newData.parent().parent().child('worlds').child($world).child('revision').val()==root.child('worlds').child($world).child('revision').val()+1&&newData.parent().parent().child('worlds').child($world).child('command').child('actor').val()==auth.uid`,'.validate':"newData.hasChildren(['revision'])&&newData.child('revision').val()==newData.parent().parent().child('worlds').child($world).child('revision').val()",revision:{'.validate':'newData.isNumber()'},events:{'$event':event},'$other':{'.validate':false}}};
 return root;
}
