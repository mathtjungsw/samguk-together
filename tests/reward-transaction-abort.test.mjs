import test from 'node:test';import assert from 'node:assert/strict';
import {rewardTransaction} from '../server/reward-transaction.js';
test('a validation failure on an asynchronous SDK retry aborts safely and detaches the reader',async()=>{
 const conflict=Error('이미 처리된 순번'),first={revision:0},second={revision:1};let detached=0,published=false;
 const ref={on(event,cb){queueMicrotask(()=>cb({exists:()=>true}));},off(){detached++;},root:{update:async()=>{published=true;}},async transaction(update){assert.deepEqual(update(first),first);await Promise.resolve();let aborted;assert.doesNotThrow(()=>{aborted=update(second);});assert.equal(aborted,undefined);return {committed:false};}};
 await assert.rejects(rewardTransaction(ref,raw=>{if(raw.revision===1)throw conflict;return raw;}),e=>e===conflict);assert.equal(detached,1);assert.equal(published,false);
});
