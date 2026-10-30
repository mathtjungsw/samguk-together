import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),auth=require('../node_modules/firebase-tools/lib/auth.js'),{requireAuth}=require('../node_modules/firebase-tools/lib/requireAuth.js'),run=require('../node_modules/firebase-tools/lib/gcp/run.js');
await requireAuth({project:'samguk-together',...auth.getGlobalDefaultAccount(),nonInteractive:true});
// Callable HTTP must reach the handler; the handler enforces Firebase Google auth and winner eligibility.
const service='projects/samguk-together/locations/asia-southeast1/services/airulerchoice';
await run.setInvokerUpdate('samguk-together',service,['public']);
const policy=await run.getIamPolicy(service);if(!policy.bindings?.some(b=>b.role==='roles/run.invoker'&&b.members.includes('allUsers')))throw Error('Callable invoker was not configured');
console.log('Winner selection callable HTTP entry configured; application authentication remains required.');
