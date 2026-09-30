// Keyed token renderer with FLIP animation: when a token (a customer or an order) moves to
// another area, the same DOM element is moved and then animated from its old position.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class TokenRenderer {
  constructor() {
    this.nodes = new Map(); // key -> element
  }

  // stages: [[containerElement, [{ key, className, html, title }]]]
  render(stages) {
    const before = new Map();
    for (const [key, el] of this.nodes) before.set(key, el.getBoundingClientRect());

    const used = new Set();
    for (const [container, items] of stages) {
      items.forEach((item, i) => {
        let el = this.nodes.get(item.key);
        if (!el) {
          el = document.createElement('span');
          this.nodes.set(item.key, el);
        }
        if (el.className !== item.className) el.className = item.className;
        if (el.innerHTML !== item.html) el.innerHTML = item.html;
        if (item.title && el.title !== item.title) el.title = item.title;
        if (container.children[i] !== el) container.insertBefore(el, container.children[i] ?? null);
        used.add(item.key);
      });
    }
    for (const [key, el] of this.nodes) {
      if (!used.has(key)) {
        el.remove();
        this.nodes.delete(key);
      }
    }

    if (reducedMotion()) return;
    for (const key of used) {
      const el = this.nodes.get(key);
      const from = before.get(key);
      const to = el.getBoundingClientRect();
      if (!from) {
        el.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'none' }], {
          duration: 350,
          easing: 'ease-out',
        });
      } else {
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 600,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          });
        }
      }
    }
  }

  clear() {
    this.nodes.forEach((el) => el.remove());
    this.nodes.clear();
  }
}
