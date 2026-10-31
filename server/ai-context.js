import {aiStartCount} from '../src/ai-world.js';
import {aiNamePool} from '../src/ai-names.js';
export async function loadAiContext(read,initial){if(initial.ai)return {names:aiNamePool(),count:initial.ai.startCount};const previous='season-'+(initial.season.number-1);
 // Only the small winner fields are required; never download old maps or dice.
 const [winners,endedAt,players,ballots]=await Promise.all([read('worlds/'+previous+'/season/winners'),read('worlds/'+previous+'/season/endedAt'),read('worlds/'+previous+'/players'),read('aiOperations/ballots/'+previous)]);
 return {names:aiNamePool(),count:aiStartCount({season:{winners:winners||[],endedAt},players:players||{},territories:{}},ballots||{})};}
