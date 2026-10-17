// Header concepts — shared behaviour: the appearance switch and the scroll state.
document.querySelectorAll('[data-toggle-theme]').forEach((button) => {
  button.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => { root.dataset.theme = next; };
    if (document.startViewTransition) document.startViewTransition(apply); else apply();
  });
});
const sentinel = document.querySelector('[data-sentinel]');
if (sentinel) {
  new IntersectionObserver(([entry]) => {
    document.documentElement.toggleAttribute('data-scrolled', !entry.isIntersecting);
  }).observe(sentinel);
}
// `?theme=dark` and `?scrolled` for screenshots.
const params = new URLSearchParams(location.search);
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');
