import './food-card.js';
import { defineComponent } from '../utils/dom.js';

const SWITCH_DELAY = 2800;
const EXIT_DELAY = 520;
const ROTATIONS = ['-5deg', '4deg', '-2deg', '6deg'];

class SpotlightCarousel extends HTMLElement {
  // Accepts data from the parent component and restarts autoplay with the new list.
  set foods(value) {
    this._foods = value;
    this.render();
    this.start();
  }

  get foods() {
    return this._foods || [];
  }

  connectedCallback() {
    this.currentIndex = 0;
    this.render();
    this.start();
  }

  disconnectedCallback() {
    this.stop();
  }

  // A single interval drives the carousel so cleanup stays predictable.
  start() {
    this.stop();
    if (this.foods.length < 2) return;

    this.timer = window.setInterval(() => this.showNextFood(), SWITCH_DELAY);
  }

  stop() {
    window.clearInterval(this.timer);
  }

  // Plays the exit animation first, then swaps the DOM node for a fresh enter animation.
  showNextFood() {
    const nextIndex = (this.currentIndex + 1) % this.foods.length;
    const activeCard = this.querySelector('[data-active-card]');

    if (activeCard) {
      activeCard.classList.remove('hero-card-enter');
      activeCard.classList.add('hero-card-exit');
    }

    window.setTimeout(() => {
      this.currentIndex = nextIndex;
      this.render();
    }, EXIT_DELAY);
  }

  // Keeps this component focused on the spotlight card area only.
  render() {
    if (!this.foods.length) return;

    const card = document.createElement('food-card');
    card.food = this.foods[this.currentIndex || 0];
    card.style.setProperty('--card-rotate', ROTATIONS[(this.currentIndex || 0) % ROTATIONS.length]);
    card.className = 'hero-card-enter block origin-center';
    card.dataset.activeCard = 'true';

    this.innerHTML = `
      <div class="absolute -right-4 top-6 h-24 w-24 rotate-12 rounded-[2rem] bg-leaf/20"></div>
      <div class="absolute -bottom-4 -left-2 h-28 w-28 -rotate-12 rounded-full bg-yolk/35"></div>
    `;
    this.append(card);
  }
}

defineComponent('spotlight-carousel', SpotlightCarousel);
