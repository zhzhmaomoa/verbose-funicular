/**
 * 地图标记的 DOM 视图。
 *
 * 标记只负责把同一地点的菜品排成九宫格。悬浮哪一格由 map-view.js
 * 统一处理，这样这里不需要持有详情卡引用。
 *
 * @typedef {import("./data.js").FoodLocation} FoodLocation
 * @typedef {import("./data.js").FoodRate} FoodRate
 */

const MAX_MARKER_DISHES = 9;
const loadedImageSources = new Set();

/**
 * 创建地点标记：最多九道菜，图片在上、菜名在下。
 * 每个菜品节点都会带上 dishIndex，详情卡根据它找到对应的完整数据。
 *
 * @param {FoodLocation} location
 */
export function createFoodMarkerContent(location) {
  const dishes = location.dishes ?? [];
  const visibleDishes = dishes.slice(0, MAX_MARKER_DISHES);
  const columns = Math.max(1, Math.min(3, visibleDishes.length));

  const marker = document.createElement("article");
  marker.className = "food-marker";
  marker.dataset.locationId = String(location.id);
  marker.dataset.columns = String(columns);
  marker.setAttribute("aria-label", `同一地点，共 ${dishes.length} 道菜`);

  const grid = document.createElement("div");
  grid.className = "food-marker__grid";

  visibleDishes.forEach((food, dishIndex) => {
    grid.append(createMarkerDish(food, dishIndex));
  });

  marker.append(grid);

  if (dishes.length > MAX_MARKER_DISHES) {
    const more = document.createElement("span");
    more.className = "food-marker__more";
    more.textContent = `+${dishes.length - MAX_MARKER_DISHES}`;
    more.setAttribute(
      "aria-label",
      `另有 ${dishes.length - MAX_MARKER_DISHES} 道菜未显示在九宫格中`,
    );
    marker.append(more);
  }

  return marker;
}

function createMarkerDish(food, dishIndex) {
  const dish = document.createElement("div");
  dish.className = "food-marker__dish";
  dish.dataset.foodId = String(food.id);
  dish.dataset.dishIndex = String(dishIndex);
  dish.tabIndex = 0;
  dish.setAttribute("role", "button");
  dish.setAttribute("aria-label", `查看 ${food.title}`);

  const imageWrap = document.createElement("div");
  imageWrap.className = "food-marker__image-wrap";
  imageWrap.append(
    createFoodImage(
      food,
      "food-marker__image",
      "food-marker__placeholder",
      "eager",
    ),
  );

  const rate = document.createElement("span");
  rate.className = "food-marker__rate";
  rate.textContent = `★ ${formatRate(food.rate)}`;
  imageWrap.append(rate);

  const name = document.createElement("div");
  name.className = "food-marker__dish-name";
  name.textContent = food.title;
  name.title = food.title;

  dish.append(imageWrap, name);
  return dish;
}

/**
 * @param {FoodRate} food
 * @param {string} imageClassName
 * @param {string} placeholderClassName
 * @param {"eager" | "lazy"} loading
 */
function createFoodImage(food, imageClassName, placeholderClassName, loading) {
  const imageAlreadyLoaded = Boolean(
    food.imageSrc && loadedImageSources.has(food.imageSrc),
  );
  const image = document.createElement("img");
  image.className = imageAlreadyLoaded
    ? imageClassName
    : `${imageClassName} is-loading`;
  image.alt = `${food.title} 美食照片`;
  image.loading = loading;
  image.decoding = "async";

  const placeholder = document.createElement("span");
  placeholder.className = placeholderClassName;
  placeholder.textContent = "🍜";
  placeholder.hidden = imageAlreadyLoaded;

  image.addEventListener(
    "load",
    () => {
      loadedImageSources.add(food.imageSrc);
      image.classList.remove("is-loading");
      placeholder.hidden = true;
    },
    { once: true },
  );
  image.addEventListener(
    "error",
    () => {
      image.hidden = true;
      placeholder.hidden = false;
    },
    { once: true },
  );

  if (food.imageSrc) {
    image.src = food.imageSrc;
  } else {
    image.hidden = true;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(image, placeholder);
  return fragment;
}

function formatRate(rate) {
  return Number.isFinite(rate) && rate > 0
    ? `${rate.toFixed(1)} 分`
    : "暂无评分";
}
