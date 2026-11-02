// A receipt proves completion. An advanced per-player sequence proves that
// this older request can no longer execute, even after its receipt was trimmed.
export function campaignRequestState(world,uid,request,worldId){
 if(!request||!world||world.season?.id!==worldId||request.worldId!==worldId)return 'unknown';
 const receipt=world.receipts?.[request.id];
 if(receipt&&(receipt.actor===uid||request.type==='announce'))return 'confirmed';
 const sequence=world.players?.[uid]?.commandSeq;
 if(Number.isInteger(request.seq)&&request.seq>=0&&Number.isInteger(sequence)&&sequence>request.seq)return 'superseded';
 return 'unknown';
}
