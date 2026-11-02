import {renderCommandPanel} from '../src/stable-panel.js';
import {missionCardHTML,commandCampaignHTML} from '../src/campaign-ui.js';
import {createSeasonWorld} from '../src/seasons.js';
import {campaignCommand} from '../server/campaign-command.js';
import {missionOptions,selectMission} from '../src/campaign-actions.js';
import {campaignStat,awardSlots} from '../src/campaign-core.js';
const output=document.querySelector('#results'),root=document.querySelector('#panel'),at=Date.now();
const check=(value,message)=>{if(!value)throw Error(message);const li=document.createElement('li');li.textContent='PASS · '+message;output.append(li);};
try{
 let s=createSeasonWorld(5,at-3600000,'browser-mission');for(const type of ['register','start'])s=campaignCommand(s,'a',{id:'browser-mission-'+type,type,name:'검증 군주'},at).world;
 const own=Object.values(s.territories).find(t=>t.owner==='a'),other=Object.values(s.territories).find(t=>!t.owner);other.owner='a';
 const m=missionOptions(s,'a','stable-options',at),prefix=()=>missionCardHTML(s,'a',{mission:m},false,null),body=clock=>'<p>다음 충원 '+clock+'</p><div style="height:500px">도시 상세 영역</div>';
 renderCommandPanel(root,prefix(),body('09:59'));const card=root.querySelector('.campaign-card'),button=card.querySelector('[data-mission-choice]');button.focus();root.scrollTop=40;
 for(let i=0;i<10;i++)renderCommandPanel(root,prefix(),body('09:'+String(58-i).padStart(2,'0')));
 check(root.querySelector('.campaign-card')===card,'10회 시계 갱신 동안 같은 목표 카드 유지');check(card.isConnected&&document.activeElement===button,'목표 버튼 포커스와 연결 유지');check(root.scrollTop===40,'스크롤 위치 유지');
 const chosen=selectMission(s,{...m,options:[{kind:'victories'}]},'victories',at),chosenHTML=()=>missionCardHTML(s,'a',{mission:chosen},false,null);renderCommandPanel(root,chosenHTML(),body('09:48'));check(root.querySelector('.campaign-card')!==card,'실제 목표 선택 변경은 반영');
 campaignStat(s,'a').wins={one:at+1,two:at+2};renderCommandPanel(root,chosenHTML(),body('09:47'));check(root.querySelector('[data-mission-complete]'),'목표 달성 시 보상 버튼 갱신');
 awardSlots(s,'a','mission-a',2,'mission',at);renderCommandPanel(root,chosenHTML(),body('09:46'));const select=root.querySelector('#campaign-reward-city');select.value=other.id;select.focus();const rewards=root.querySelector('.campaign-card');
 for(let i=0;i<10;i++){s.revision++;renderCommandPanel(root,chosenHTML(),body('09:'+String(45-i).padStart(2,'0')));}
 check(root.querySelector('.campaign-card')===rewards,'관련 없는 전황 갱신에도 목표 카드 유지');check(root.querySelector('#campaign-reward-city')===select&&select.value===other.id&&document.activeElement===select,'보상 도시 선택과 포커스 유지');
 root.innerHTML='<p>포로 탭</p>';renderCommandPanel(root,chosenHTML(),body('09:35'));check(root.querySelector('#campaign-reward-city'),'다른 탭을 다녀온 뒤 목표 카드 복구');
 renderCommandPanel(root,commandCampaignHTML(s,null,false),body('09:34'));check(!root.querySelector('.campaign-card')&&!root.querySelector('[data-mission-choice]')&&!root.querySelector('#campaign-reward-city'),'영토·명령 영역에는 목표/보상 카드 없음');renderCommandPanel(root,commandCampaignHTML(s,{id:'pending-command'},false),body('09:33'));check(root.querySelector('[data-campaign-retry]'),'목표를 분리해도 미확인 명령 재시도 가능');document.querySelector('#status').textContent=output.children.length+'개 검사 통과 · 운영 데이터 연결 없음';document.documentElement.dataset.testResult='passed';
}catch(error){document.querySelector('#status').textContent='FAIL · '+error.message;document.documentElement.dataset.testResult='failed';console.error(error);}
