const toggle = document.querySelector('#motion-toggle');
const scenes = [...document.querySelectorAll('[data-animation]')];
const posters = scenes.map(scene => scene.getAttribute('src'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let playing = !reducedMotion.matches;
const loaded = new Set();

function showMotion(next) {
  playing = next;
  for (const scene of loaded) {
    scene.src = playing ? scene.dataset.animation : posters[scenes.indexOf(scene)];
  }
  toggle.setAttribute('aria-pressed', String(playing));
  toggle.textContent = playing ? '전쟁 GIF 멈춤' : '전쟁 GIF 재생';
}

toggle.hidden = false;
showMotion(playing);
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const scene = entry.target;
    loaded.add(scene);
    if (playing) scene.src = scene.dataset.animation;
    observer.unobserve(scene);
  }
}, { rootMargin: '150px' });
for (const scene of scenes) observer.observe(scene);

toggle.addEventListener('click', () => showMotion(!playing));
reducedMotion.addEventListener('change', event => showMotion(!event.matches));
