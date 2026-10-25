/**
 * 一个地点可能包含多道菜。Marker 用最多九宫格展示菜品，
 * 悬浮卡则展示该地点的完整菜品列表。
 * @typedef {import("./data.js").FoodLocation} FoodLocation
 * @typedef {import("./data.js").FoodRate} FoodRate
 */

const MAX_MARKER_DISHES = 9;
const loadedImageSources = new Set();

/**
 * 创建地点标注：图片在上、菜名在下，按菜品数量自动使用一行到三行。
 * @param {FoodLocation} location
 */
export function createFoodMarkerContent(location) {
  const dishes = location.dishes ?? [];
  const visibleDishes = dishes.slice(0, MAX_MARKER_DISHES);
  const columns = Math.max(1, Math.min(3, visibleDishes.length));

  const marker = document.createElement("article");
  marker.className = "food-marker";
  marker.dataset.columns = String(columns);
  marker.dataset.rows = String(Math.max(1, Math.ceil(visibleDishes.length / 3)));
  marker.setAttribute("aria-label", `同一地点，共 ${dishes.length} 道菜`);

  const grid = document.createElement("div");
  grid.className = "food-marker__grid";

  for (const food of visibleDishes) {
    grid.append(createMarkerDish(food));
  }

  marker.append(grid);

  if (dishes.length > MAX_MARKER_DISHES) {
    const more = document.createElement("span");
    more.className = "food-marker__more";
    more.textContent = `+${dishes.length - MAX_MARKER_DISHES}`;
    more.setAttribute(
      "aria-label",
      `另有 ${dishes.length - MAX_MARKER_DISHES} 道菜，悬浮查看全部`,
    );
    marker.append(more);
  }

  detectOverflowingDishNames(marker);
  return marker;
}

/**
 * 创建一个可重复使用的高德信息窗口。
 */
export function createFoodInfoWindow() {
  return new window.AMap.InfoWindow({
    isCustom: true,
    autoMove: false,
    closeWhenClickMap: true,
    offset: new window.AMap.Pixel(0, -150),
  });
}

/**
 * 鼠标悬浮标注时打开该地点的多菜详情卡。
 * @param {AMap.InfoWindow} infoWindow
 * @param {AMap.Map} map
 * @param {AMap.Marker} marker
 * @param {FoodLocation} location
 * @param {{ onCardEnter: () => void, onCardLeave: () => void }} hoverState
 */
export function showFoodInfo(infoWindow, map, marker, location, hoverState) {
  const card = createFoodCard(location);
  infoWindow.setContent(card);
  infoWindow.setOffset(
    new window.AMap.Pixel(0, -(getMarkerHeight(marker) + 16)),
  );

  infoWindow.open(map, marker.getPosition());

  // InfoWindow 会把传入节点渲染到自己的容器中，事件必须绑定到实际渲染后的
  // 节点，否则鼠标移入卡片时无法取消 marker 的延迟关闭。
  const renderedCard =
    map.getContainer()?.querySelector(".food-card") ?? card;
  bindCardInteraction(renderedCard, hoverState);
}

function createMarkerDish(food) {
  const dish = document.createElement("div");
  dish.className = "food-marker__dish";

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

  const nameText = document.createElement("span");
  nameText.className = "food-marker__dish-name-text";
  nameText.textContent = food.title;

  const measure = document.createElement("span");
  measure.className = "food-marker__dish-name-measure";
  measure.textContent = food.title;
  measure.setAttribute("aria-hidden", "true");

  const marquee = document.createElement("div");
  marquee.className = "food-marker__dish-marquee";
  marquee.setAttribute("aria-hidden", "true");

  const track = document.createElement("div");
  track.className = "food-marker__dish-marquee-track";
  const firstCopy = document.createElement("span");
  const secondCopy = document.createElement("span");
  firstCopy.textContent = food.title;
  secondCopy.textContent = food.title;
  track.append(firstCopy, secondCopy);
  marquee.append(track);

  name.append(nameText, marquee, measure);
  dish.append(imageWrap, name);
  return dish;
}

/**
 * 两行仍放不下的菜名才启用跑马灯，避免较短菜名无意义地移动。
 * @param {HTMLElement} marker
 */
function detectOverflowingDishNames(marker) {
  window.requestAnimationFrame(() => {
    // 等 MarkerCluster 将节点插入地图后再测量宽度，避免 0 宽度误判。
    window.requestAnimationFrame(() => {
      for (const name of marker.querySelectorAll(".food-marker__dish-name")) {
        if (name.clientWidth === 0) {
          continue;
        }

        const measure = name.querySelector(".food-marker__dish-name-measure");
        const lineHeight = Number.parseFloat(
          window.getComputedStyle(measure).lineHeight,
        );
        const fullHeight = measure.getBoundingClientRect().height;

        if (Number.isFinite(lineHeight) && fullHeight > lineHeight * 2 + 1) {
          name.classList.add("is-marquee");
        }
      }
    });
  });
}

function createFoodCard(location) {
  const dishes = location.dishes ?? [];
  const card = document.createElement("article");
  card.className = "food-card";
  card.setAttribute("aria-label", `同一地点共 ${dishes.length} 道菜的详细信息`);

  const top = document.createElement("div");
  top.className = "food-card__top";

  const heading = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "food-card__eyebrow";
  eyebrow.textContent = "同址美食";
  const title = document.createElement("h2");
  title.className = "food-card__title";
  title.textContent = `${dishes.length} 道菜`;
  heading.append(eyebrow, title);

  const averageRate = document.createElement("div");
  averageRate.className = "food-card__rate";
  averageRate.textContent = `均分 ★ ${formatAverageRate(dishes)}`;
  top.append(heading, averageRate);

  const list = document.createElement("div");
  list.className = "food-card__list";
  list.setAttribute("role", "list");
  for (const food of dishes) {
    list.append(createCardDish(food));
  }

  const locationMeta = document.createElement("div");
  locationMeta.className = "food-card__location";
  locationMeta.append(
    createMetaItem("同址坐标"),
    createMetaItem(`${location.lng.toFixed(6)}, ${location.lat.toFixed(6)}`),
  );

  card.append(top, list, locationMeta);
  return card;
}

function createCardDish(food) {
  const dish = document.createElement("article");
  dish.className = "food-card__dish";
  dish.setAttribute("role", "listitem");

  const imageWrap = document.createElement("div");
  imageWrap.className = "food-card__dish-image-wrap";
  imageWrap.append(
    createFoodImage(
      food,
      "food-card__dish-image",
      "food-card__dish-placeholder",
      "lazy",
    ),
  );

  const body = document.createElement("div");
  body.className = "food-card__dish-body";

  const top = document.createElement("div");
  top.className = "food-card__dish-top";

  const title = document.createElement("h3");
  title.className = "food-card__dish-title";
  title.textContent = food.title;
  title.title = food.title;

  const rate = document.createElement("span");
  rate.className = "food-card__dish-rate";
  rate.textContent = `★ ${formatRate(food.rate)}`;
  top.append(title, rate);

  const desc = document.createElement("p");
  desc.className = "food-card__dish-desc";
  desc.textContent = food.desc || "暂无更多描述";

  const meta = document.createElement("div");
  meta.className = "food-card__dish-meta";
  meta.textContent = food.date || "日期未知";

  body.append(top, desc, meta);
  dish.append(imageWrap, body);
  return dish;
}

function bindCardInteraction(card, hoverState) {
  for (const eventName of [
    "mouseenter",
    "pointerenter",
    "pointerover",
    "pointermove",
  ]) {
    card.addEventListener(eventName, hoverState.onCardEnter);
  }
  for (const eventName of ["mouseleave", "pointerleave"]) {
    card.addEventListener(eventName, hoverState.onCardLeave);
  }

  // 卡片内的滚动、点击不要继续传给地图，否则地图会缩放或拖动。
  for (const eventName of ["wheel", "mousedown", "click", "pointerdown"]) {
    card.addEventListener(eventName, (event) => event.stopPropagation());
  }
}

function getMarkerHeight(marker) {
  const content = marker.getContent?.();
  if (content instanceof Element) {
    return content.getBoundingClientRect().height;
  }

  return Number(marker.getSize?.()?.height) || 150;
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

function createMetaItem(text) {
  const item = document.createElement("span");
  item.textContent = text;
  return item;
}

function formatRate(rate) {
  return Number.isFinite(rate) ? `${rate.toFixed(1)} 分` : "暂无评分";
}

function formatAverageRate(dishes) {
  const rated = dishes
    .map((food) => food.rate)
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  if (rated.length === 0) {
    return "暂无评分";
  }

  const average = rated.reduce((sum, rate) => sum + rate, 0) / rated.length;
  return `${average.toFixed(1)} 分`;
}
