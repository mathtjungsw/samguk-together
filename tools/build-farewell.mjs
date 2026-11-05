import { cp, readFile, writeFile } from 'node:fs/promises';

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export async function buildFarewell() {
  const champions = JSON.parse(await readFile('farewell/champions.json', 'utf8'));
  if (champions.map(row => row.season).join(',') !== '1,2,3,4,5') {
    throw new Error('공식 기록은 정규 시즌 1~5만 표시합니다.');
  }

  const list = champions.map(({ season, winners }) => {
    if (!winners.length) throw new Error(`시즌 ${season} 우승자가 없습니다.`);
    const names = winners.map(({ name }) => escapeHtml(name)).join(' · ');
    return `<li><span>시즌 ${season}</span><strong>${names}</strong><small>영토 ${winners[0].territories}곳</small></li>`;
  }).join('\n        ');
  const html = await readFile('farewell/index.html', 'utf8');

  await cp('farewell/media', 'dist/media', { recursive: true });
  await cp('farewell/farewell.css', 'dist/farewell.css');
  await cp('farewell/farewell.js', 'dist/farewell.js');
  await writeFile('dist/index.html', html.replace('<!-- CHAMPIONS -->', () => list));
  await writeFile('dist/.nojekyll', '');
  console.log('시즌 5 종료 대문을 빌드했습니다.');
}
