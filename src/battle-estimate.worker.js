import {estimateBattle} from './engine.js';
self.onmessage=({data})=>{try{const result=estimateBattle(data.world,data.from,data.to,data.units,data.ids,data.at);self.postMessage({key:data.key,...result});}catch(error){self.postMessage({key:data.key,error:error.message});}};
