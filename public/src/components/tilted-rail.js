import './food-card.js';
import { defineComponent } from '../utils/dom.js';

const TILT_SEQUENCE = ['-7deg', '4deg', '-3deg', '8deg', '-5deg'];

class TiltedRail extends HTMLElement {
  // The parent passes food data in; this component only decides how to lay it out.
  set foods(value) {
    this._foods = value;
    this.render();
  }

  get foods() {
    return this._foods || [];
  }

  connectedCallback() {
    this.render();
  }

  // Each card gets a repeatable tilt so the rail feels hand-placed instead of uniform.
  createCard(food, index) {
    const card = document.createElement('food-card');
    card.food = food;
    card.variant = 'rail';
    card.className = 'block shrink-0';
    card.style.transform = `rotate(${TILT_SEQUENCE[index % TILT_SEQUENCE.length]})`;
    return card;
  }

  // Builds a single long track; CSS handles the continuous horizontal motion.
  render() {
    if (!this.foods.length) return;

    const track = document.createElement('div');
    track.className = 'tilted-track flex w-max items-center gap-5 py-8 pl-5';

    // Duplicate the list so the CSS animation can loop without a visible gap.
    [...this.foods, ...this.foods].forEach((food, index) => {
      track.append(this.createCard(food, index));
    });

    this.innerHTML = '';
    this.append(track);
  }
}

defineComponent('tilted-rail', TiltedRail);
