import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

test('the closed season blocks guest and signed-in access, including cached game clients', async () => {
  const rules = await readFile('closure-rules.json', 'utf8');
  const env = await initializeTestEnvironment({
    projectId: 'demo-samguk-online',
    database: { host: '127.0.0.1', port: 9000, rules }
  });
  try {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(context => set(ref(context.database()), {
      runtimeMode: { mode: 'closed', finalSeason: 'season-5' },
      sparkWorlds: { 'season-6': { revision: 12 } }
    }));
    const guest = env.unauthenticatedContext().database();
    const player = env.authenticatedContext('existing-ruler', {
      firebase: { sign_in_provider: 'google.com' }
    }).database();
    await assertFails(get(ref(guest, 'runtimeMode')));
    await assertFails(get(ref(player, 'sparkWorlds/season-6')));
    await assertFails(update(ref(player), {
      'sparkWorlds/season-6/revision': 13,
      'sparkChat/season-6/example': { text: 'test' }
    }));
  } finally {
    await env.cleanup();
  }
});
