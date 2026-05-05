import { defineComponent, escapeHtml } from '../utils/dom.js';
import { createRatingText, createStars } from '../utils/rating.js';

class FoodCard extends HTMLElement {
  // Food data is set as a JS property because objects do not fit cleanly in HTML attributes.
  set food(value) {
    this._food = value;
    this.render();
  }

  // The same component can render as a large hero card or a compact rail card.
  set variant(value) {
    this._variant = value;
    this.render();
  }

  get food() {
    return this._food;
  }

  get variant() {
    return this._variant || 'hero';
  }

  connectedCallback() {
    this.render();
  }

  // Chooses one card template and leaves animation/layout to the parent carousel.
  render() {
    if (!this.food) return;

    this.innerHTML = this.variant === 'rail'
      ? this.renderRailCard()
      : this.renderHeroCard();
  }

  renderHeroCard() {
    const food = this.food;

    return `
      <article class="relative overflow-hidden rounded-[2rem] border-[6px] border-white bg-white shadow-sticker">
        <img
          class="h-[14.5rem] w-full object-cover sm:h-[22rem] lg:h-[22rem]"
          src="${food.image}"
          alt="${escapeHtml(food.name)}"
        />
        <div class="absolute left-3 top-3 rounded-full bg-yolk px-4 py-2 text-sm font-black text-ink shadow">
          ${escapeHtml(food.location)}
        </div>
        <div class="bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <h2 class="font-display text-2xl font-black">${escapeHtml(food.name)}</h2>
            <span class="rounded-full bg-tomato px-3 py-1 text-sm font-black text-white">
              ${createRatingText(food.rating)}
            </span>
          </div>
          <p class="mt-2 text-sm leading-6 text-ink/70">${escapeHtml(food.note)}</p>
          <p class="mt-3 text-lg tracking-[0.12em] text-yolk" aria-label="评分 ${createRatingText(food.rating)}">
            ${createStars(food.rating)}
          </p>
        </div>
      </article>
    `;
  }

  renderRailCard() {
    const food = this.food;

    return `
      <article class="w-44 shrink-0 overflow-hidden rounded-3xl border-[5px] border-white bg-white shadow-sticker sm:w-56">
        <img
          class="h-36 w-full object-cover sm:h-44"
          src="${food.image}"
          alt="${escapeHtml(food.name)}"
        />
        <div class="p-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="truncate font-display text-xl font-black">${escapeHtml(food.name)}</h3>
            <strong class="text-sm text-tomato">${food.rating.toFixed(1)}</strong>
          </div>
          <p class="mt-1 truncate text-xs font-bold text-leaf">${escapeHtml(food.location)}</p>
        </div>
      </article>
    `;
  }
}

defineComponent('food-card', FoodCard);
