import {renderCommandPanel} from '../src/stable-panel.js';
import {rewardCardHTML,commandCampaignHTML} from '../src/campaign-ui.js';
import {createSeasonWorld} from '../src/seasons.js';
import {campaignCommand} from '../server/campaign-command.js';
import {awardSlots} from '../src/campaign-core.js';
const output=document.querySelector('#results'),root=document.querySelector('#panel'),at=Date.now();
const check=(value,message)=>{if(!value)throw Error(message);const li=document.createElement('li');li.textContent='PASS · '+message;output.append(li);};
try{
 let s=createSeasonWorld(5,at-3600000,'browser-reward');for(const type of ['register','start'])s=campaignCommand(s,'a',{id:'browser-reward-'+type,type,name:'검증 군주'},at).world;
 const other=Object.values(s.territories).find(t=>!t.owner);other.owner='a';
 check(rewardCardHTML(s,'a',false)==='','미확정 비밀 임무와 보상 카드 없음');awardSlots(s,'a','legacy-reward',2,'mission',at);awardSlots(s,'a','bounty-reward',1,'bounty',at);
 const prefix=()=>commandCampaignHTML(s,'a',null,false),body=clock=>'<p>다음 충원 '+clock+'</p><div style="height:500px">도시 상세 영역</div>';
 renderCommandPanel(root,prefix(),body('09:59'));const card=root.querySelector('.campaign-card'),select=root.querySelector('#campaign-reward-city');select.value=other.id;select.focus();root.scrollTop=40;
 for(let i=0;i<10;i++){s.revision++;renderCommandPanel(root,prefix(),body('09:'+String(58-i).padStart(2,'0')));}
 check(root.querySelector('.campaign-card')===card,'10회 시계 갱신 동안 같은 보상 카드 유지');check(select.isConnected&&document.activeElement===select,'보상 도시 선택 포커스 유지');check(select.value===other.id,'선택한 보상 도시 유지');check(root.scrollTop===40,'스크롤 위치 유지');
 check(!root.textContent.includes('비밀 목표')&&!root.querySelector('[data-mission-choice]'),'비밀 목표와 선택 기능 없음');check(root.textContent.includes('기존 보상')&&root.textContent.includes('토벌 보상'),'확정 기존 보상과 토벌 보상 수령 유지');
 root.innerHTML='<p>포로 탭</p>';renderCommandPanel(root,prefix(),body('09:35'));check(root.querySelector('#campaign-reward-city'),'다른 탭을 다녀온 뒤 보상 카드 복구');
 renderCommandPanel(root,commandCampaignHTML(s,'a',{id:'pending-command'},false),body('09:33'));check(root.querySelector('[data-campaign-retry]'),'미확인 일반 명령 재시도 유지');document.querySelector('#status').textContent=output.children.length+'개 검사 통과 · 운영 데이터 연결 없음';document.documentElement.dataset.testResult='passed';
}catch(error){document.querySelector('#status').textContent='FAIL · '+error.message;document.documentElement.dataset.testResult='failed';console.error(error);}
