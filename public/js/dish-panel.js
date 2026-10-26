/**
 * 右侧菜品详情卡片。
 *
 * 数据变化只通过 showDish() 进入这里。地图标记不需要知道卡片内部结构，
 * 后续交接时可以把“选择菜品”和“展示菜品”分开理解。
 *
 * @typedef {import("./data.js").FoodLocation} FoodLocation
 * @typedef {import("./data.js").FoodRate} FoodRate
 */

const HIDE_DELAY_MS = 280;

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
  let cardHovered = false;
  let hoveredMarkerId = null;
  let hideTimer = null;

  // 只绑定一套 hover 事件：现代浏览器用 pointer，电视端旧浏览器回退到 mouse。
  const hoverStartEvent = supportsPointerEvents()
    ? "pointerenter"
    : "mouseenter";
  const hoverEndEvent = supportsPointerEvents() ? "pointerleave" : "mouseleave";

  panel.addEventListener(hoverStartEvent, () => {
    cardHovered = true;
    cancelHide();
  });
  panel.addEventListener(hoverEndEvent, () => {
    cardHovered = false;
    scheduleHide();
  });

  /**
   * @param {FoodLocation} location
   * @param {FoodRate} food
   */
  function showDish(location, food) {
    cancelHide();

    // 九宫格会持续触发 hover 事件，同一道菜已显示时不重复更新 DOM。
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
      currentDishId = food.id;
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

  function hideDish() {
    cancelHide();
    const wasVisible = panel.classList.contains("is-visible");
    panel.classList.remove("is-visible");
    panel.setAttribute("aria-hidden", "true");
    currentDishId = null;
    hoveredMarkerId = null;

    if (wasVisible) {
      options.onHide?.();
    }
  }

  /**
   * 鼠标离开 marker 或卡片后延迟收起。进入任一区域都会取消这次收起，
   * 留出从 marker 移动到卡片的操作时间。
   * @param {string | null} [dishId]
   */
  function scheduleHide(dishId = currentDishId) {
    cancelHide();
    if (!dishId || cardHovered || hoveredMarkerId !== null) {
      return;
    }

    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (
        cardHovered ||
        hoveredMarkerId !== null ||
        currentDishId !== dishId
      ) {
        return;
      }
      hideDish();
    }, HIDE_DELAY_MS);
  }

  function cancelHide() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  /**
   * marker 的 hover 状态参与统一判断，避免卡片自身的 leave 事件误收起。
   * @param {string | null} markerId
   * @param {boolean} isHovered
   */
  function setMarkerHovered(markerId, isHovered) {
    if (isHovered) {
      hoveredMarkerId = markerId;
      cancelHide();
      return;
    }

    if (hoveredMarkerId === markerId) {
      hoveredMarkerId = null;
    }
    scheduleHide(currentDishId);
  }

  return {
    showDish,
    hideDish,
    scheduleHide,
    cancelHide,
    setMarkerHovered,
  };
}

function formatCoordinates(lng, lat) {
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
}

function supportsPointerEvents() {
  return typeof window !== "undefined" && "PointerEvent" in window;
}
