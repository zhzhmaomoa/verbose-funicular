/**
 * 右侧菜品详情卡片。
 *
 * 卡片只响应明确的选择结果，不监听 hover、不设置延迟关闭计时器。
 * 打开与关闭的决策全部在 map-view.js 的选中状态控制器中完成。
 *
 * @typedef {import("./data.js").FoodLocation} FoodLocation
 * @typedef {import("./data.js").FoodRate} FoodRate
 */

/**
 * @param {HTMLElement} panel
 * @param {{ onHide?: () => void }} [options]
 */
export function createDishPanel(panel, options = {}) {
  const refs = {
    image: panel.querySelector("#dish-panel-image"),
    imagePlaceholder: panel.querySelector("#dish-panel-image-placeholder"),
    title: panel.querySelector("#dish-panel-title"),
    description: panel.querySelector("#dish-panel-description"),
    coordinates: panel.querySelector("#dish-panel-coordinates"),
    date: panel.querySelector("#dish-panel-date"),
    body: panel.querySelector("#dish-panel-body"),
  };

  let currentDishId = null;
  let imageVersion = 0;

  /**
   * @param {FoodLocation} location
   * @param {FoodRate} food
   */
  function showDish(location, food) {
    // 重复点击同一道菜、且卡片已经可见时，不重复刷新图片和动画。
    if (currentDishId === food.id && panel.classList.contains("is-visible")) {
      return;
    }

    currentDishId = food.id;
    panel.classList.add("is-visible");
    panel.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-label", `${food.title} 的菜品详情`);

    refs.title.textContent = food.title;
    const description = food.desc?.trim() ?? "";
    refs.description.textContent = description;
    refs.description.hidden = !description;
    refs.coordinates.textContent = formatCoordinates(location.lng, location.lat);
    refs.date.textContent = food.date;
    refs.date.hidden = !food.date;

    updateImage(food);
    animateBody();
  }

  function hideDish() {
    const wasVisible = panel.classList.contains("is-visible");
    if (!wasVisible) {
      currentDishId = null;
      return;
    }

    panel.classList.remove("is-visible");
    panel.setAttribute("aria-hidden", "true");
    currentDishId = null;

    // 让仍在加载中的旧图片失效；下一次打开时会使用新的版本号。
    imageVersion += 1;
    options.onHide?.();
  }

  /**
   * 先预加载新图片，加载成功后再替换面板图片，避免旧图和新图短暂混在一起。
   * @param {FoodRate} food
   */
  function updateImage(food) {
    const version = ++imageVersion;
    refs.image.classList.add("is-loading");
    refs.imagePlaceholder.hidden = false;
    refs.image.removeAttribute("src");

    if (!food.imageSrc) {
      refs.image.alt = "";
      refs.image.classList.remove("is-loading");
      return;
    }

    const loader = new Image();
    loader.decoding = "async";
    loader.onload = () => {
      if (version !== imageVersion) {
        return;
      }

      refs.image.src = food.imageSrc;
      refs.image.alt = `${food.title} 美食照片`;
      refs.image.classList.remove("is-loading");
      refs.imagePlaceholder.hidden = true;
    };
    loader.onerror = () => {
      if (version !== imageVersion) {
        return;
      }

      refs.image.alt = "";
      refs.image.classList.remove("is-loading");
      refs.imagePlaceholder.hidden = false;
    };
    loader.src = food.imageSrc;
  }

  function animateBody() {
    if (typeof refs.body.animate !== "function") {
      return;
    }

    refs.body.animate(
      [
        { opacity: 0.35, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 260, easing: "ease-out" },
    );
  }

  return { showDish, hideDish };
}

function formatCoordinates(lng, lat) {
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
}
