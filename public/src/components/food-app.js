import './spotlight-carousel.js';
import './tilted-rail.js';
import { foods } from '../data/foods.js';
import { defineComponent } from '../utils/dom.js';

class FoodApp extends HTMLElement {
  connectedCallback() {
    this.render();
    this.mountCarousels();
  }

  // Wiring data here keeps child components reusable and unaware of the full app.
  mountCarousels() {
    this.querySelector('spotlight-carousel').foods = foods;
    this.querySelector('tilted-rail').foods = foods;
  }

  // Mobile-first layout: hero content stays compact, with the rail peeking below.
  render() {
    this.innerHTML = `
      <main class="taste-bg grain-layer relative min-h-screen overflow-hidden">
        <section class="mx-auto flex min-h-[72vh] w-full max-w-6xl flex-col justify-between px-5 pb-3 pt-8 sm:px-8 lg:min-h-[74vh] lg:px-10 lg:pt-12">
          <div class="grid flex-1 grid-cols-1 items-center gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
            <div class="relative z-10">
              <p class="mb-4 inline-flex rotate-[-3deg] rounded-full bg-leaf px-4 py-2 text-xs font-black text-white shadow">
                TODAY'S TASTE
              </p>
              <h1 class="font-display text-[clamp(2.65rem,13vw,6.8rem)] font-black leading-[0.88] text-ink">
                日日<br />
                好味<br />
                评分
              </h1>
              <p class="mt-4 max-w-[18rem] text-sm font-bold leading-7 text-ink/70 sm:max-w-sm sm:text-base lg:mt-5">
                每一道菜都有自己的脾气，翻到哪张，就给今天的胃口一个答案。
              </p>
            </div>

            <spotlight-carousel class="relative z-10 block min-w-0 px-3 sm:px-8 lg:px-0"></spotlight-carousel>
          </div>
        </section>

        <section class="relative z-20 -mt-4 overflow-hidden border-y-4 border-ink bg-mint/85 py-2">
          <div class="mb-[-0.6rem] flex items-center justify-between px-5 text-xs font-black uppercase tracking-[0.28em] text-leaf">
            <span>Food parade</span>
            <span>Swipe the mood</span>
          </div>
          <tilted-rail class="block"></tilted-rail>
        </section>
      </main>
    `;
  }
}

defineComponent('food-app', FoodApp);
