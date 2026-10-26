import { createFoodMarkerContent } from "./marker-view.js";
import { createDishPanel } from "./dish-panel.js";
import { groupFoodsByLocation } from "./data.js";

/**
 * 标记选型说明：
 * AMap.MarkerCluster 只渲染当前可见点，并自动聚合相近位置。
 * 每个地点内部再用九宫格展示最多九道菜，兼顾可读性和大量数据时的性能。
 */
const CHINA_CENTER = [104.195397, 35.86166];

/**
 * 初始化高德地图。地图始终铺满视口，详情面板作为右侧浮层覆盖在地图上方。
 */
export function createFoodMap(containerId) {
  return new window.AMap.Map(containerId, {
    viewMode: "2D",
    center: CHINA_CENTER,
    zoom: 5,
    resizeEnable: true,
    mapStyle: "amap://styles/normal",
  });
}

/**
 * 创建聚合标记，并绑定“九宫格菜品 -> 右侧详情面板”的选择逻辑。
 *
 * @param {AMap.Map} map
 * @param {import("./data.js").FoodRate[]} foods
 * @param {HTMLElement} dishPanelElement
 */
export function addFoodMarkers(map, foods, dishPanelElement) {
  const activeSelection = { content: null };
  const dishPanel = createDishPanel(dishPanelElement, {
    onHide: () => clearActiveSelection(activeSelection),
  });
  const locations = groupFoodsByLocation(foods);
  const points = locations.map((location) => ({
    ...location,
    lnglat: [location.lng, location.lat],
  }));

  const cluster = new window.AMap.MarkerCluster(map, points, {
    gridSize: 100,
    maxZoom: 16,
    renderMarker: (context) =>
      renderFoodMarker(context, points, dishPanel, activeSelection),
    renderClusterMarker: renderClusterMarker,
  });

  // 聚合点点击后放大，直到拆成更小的聚合点或单个地点标记。
  cluster.on("click", (event) => zoomIntoCluster(map, event));
  fitMapToLocations(map, locations, dishPanelElement);

  return { cluster, locations };
}

/**
 * MarkerCluster 绘制单个地点时调用。
 */
function renderFoodMarker(context, points, dishPanel, activeSelection) {
  const location = context.data?.[0] ?? findLocationByMarker(context.marker, points);
  if (!location) {
    return;
  }

  const marker = context.marker;
  let content = marker.getContent?.();

  // 地图移动时 renderMarker 可能重复执行。相同地点复用原 DOM，
  // 既避免图片重新加载，也避免重复绑定事件。
  if (
    marker.__foodLocationId !== location.id ||
    !(content instanceof Element)
  ) {
    marker.__foodLocationId = location.id;
    content = createFoodMarkerContent(location);
    marker.setContent(content);
  }

  marker.setAnchor("bottom-center");
  marker.setExtData(location);
  bindDishSelection(content, location, dishPanel, activeSelection);
}

/**
 * 用事件委托监听九宫格内的菜品，不依赖地图弹窗。
 * marker 或卡片任一处于 hover 状态时保持显示，两者都离开后延迟收起。
 */
function bindDishSelection(content, location, dishPanel, activeSelection) {
  if (content.dataset.selectionBound === "true") {
    return;
  }
  content.dataset.selectionBound = "true";

  let markerHovered = false;
  let activeDishId = null;
  const hoverStartEvent = supportsPointerEvents()
    ? "pointerenter"
    : "mouseenter";
  const hoverEndEvent = supportsPointerEvents() ? "pointerleave" : "mouseleave";
  const hoverSelectEvent = supportsPointerEvents() ? "pointerover" : "mouseover";

  const selectDish = (dishElement, isMarkerHovered = false) => {
    const dishIndex = Number(dishElement.dataset.dishIndex);
    const food = location.dishes[dishIndex];
    if (!food) {
      return;
    }

    if (
      activeSelection.content &&
      activeSelection.content !== content
    ) {
      setActiveDish(activeSelection.content, null);
    }
    activeSelection.content = content;
    activeDishId = food.id;
    dishPanel.cancelHide();
    if (isMarkerHovered) {
      dishPanel.setMarkerHovered(location.id, true);
    }
    setMarkerHighlighted(true);
    setActiveDish(content, dishElement);
    dishPanel.showDish(location, food);
  };

  const selectFromEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const dishElement = target.closest(".food-marker__dish");
    if (dishElement && content.contains(dishElement)) {
      selectDish(dishElement, event.type === hoverSelectEvent);
    }
  };

  // 只绑定指针事件或鼠标事件其中之一，避免电视端同一动作触发两次冲突逻辑。
  content.addEventListener(hoverSelectEvent, selectFromEvent);
  content.addEventListener("click", selectFromEvent);

  // 用键盘聚焦九宫格时，同样把对应菜品显示到右侧。
  content.addEventListener("focusin", selectFromEvent);
  content.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const dishElement = event.target.closest?.(".food-marker__dish");
    if (!dishElement || !content.contains(dishElement)) {
      return;
    }

    event.preventDefault();
    selectDish(dishElement);
  });

  // 某些电视浏览器没有 :has()，这里直接给高德外层节点加类名，确保悬浮标记置顶。
  const setMarkerHighlighted = (isHighlighted) => {
    const markerElement = content.closest(".amap-marker");
    markerElement?.classList.toggle("is-food-marker-active", isHighlighted);
  };

  content.addEventListener(hoverStartEvent, () => {
    markerHovered = true;
    dishPanel.cancelHide();
    if (activeDishId) {
      dishPanel.setMarkerHovered(location.id, true);
    }
    setMarkerHighlighted(true);
  });
  content.addEventListener(hoverEndEvent, () => {
    markerHovered = false;
    setMarkerHighlighted(false);
    dishPanel.setMarkerHovered(location.id, false);
  });
  content.addEventListener("focusin", () => setMarkerHighlighted(true));
  content.addEventListener("focusout", (event) => {
    if (!getDishElement(event.relatedTarget, content)) {
      setMarkerHighlighted(false);
      if (!markerHovered) {
        dishPanel.scheduleHide(activeDishId);
      }
    }
  });
}

function getDishElement(target, content) {
  if (!(target instanceof Element)) {
    return null;
  }

  const dish = target.closest(".food-marker__dish");
  return dish && content.contains(dish) ? dish : null;
}

function setActiveDish(content, activeDish) {
  for (const dish of content.querySelectorAll(".food-marker__dish")) {
    dish.classList.toggle("is-active", dish === activeDish);
  }
}

function clearActiveSelection(activeSelection) {
  if (!activeSelection.content) {
    return;
  }

  setActiveDish(activeSelection.content, null);
  activeSelection.content = null;
}

function supportsPointerEvents() {
  return typeof window !== "undefined" && "PointerEvent" in window;
}

function fitMapToLocations(map, locations, dishPanelElement) {
  if (locations.length === 0) {
    return;
  }

  const lngList = locations.map((location) => location.lng);
  const latList = locations.map((location) => location.lat);
  // 单点时给边界留一点范围，仍然复用同一套“左侧有效区域”计算。
  const lngSpread = Math.max(
    0.01,
    (Math.max(...lngList) - Math.min(...lngList)) * 0.02,
  );
  const latSpread = Math.max(
    0.01,
    (Math.max(...latList) - Math.min(...latList)) * 0.02,
  );
  const southWest = [
    Math.min(...lngList) - lngSpread,
    Math.min(...latList) - latSpread,
  ];
  const northEast = [
    Math.max(...lngList) + lngSpread,
    Math.max(...latList) + latSpread,
  ];
  const bounds = new window.AMap.Bounds(southWest, northEast);

  // 右侧紧凑卡片需要留出显示空间，通过不对称 padding 避免标记被遮住。
  const mapWidth = map.getContainer()?.clientWidth ?? window.innerWidth;
  const cardWidth = dishPanelElement?.getBoundingClientRect().width || 460;
  const rightPadding = Math.min(mapWidth * 0.7, cardWidth + 80);
  const padding = [100, rightPadding, 100, 100];
  const [zoom, center] = map.getFitZoomAndCenterByBounds(bounds, padding, 16);
  map.setZoomAndCenter(zoom, center);
}

function findLocationByMarker(marker, points) {
  const position = marker.getPosition();
  if (!position) {
    return null;
  }

  return (
    points.find(
      (location) =>
        Math.abs(location.lng - position.lng) < 0.000001 &&
        Math.abs(location.lat - position.lat) < 0.000001,
    ) ?? null
  );
}

function renderClusterMarker(context) {
  const count =
    Number(context.count) || Number(context.marker?.getCount?.()) || 1;
  const size = Math.min(92, 54 + Math.log2(count + 1) * 10);
  const content = document.createElement("div");
  content.className = "food-cluster";
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;

  const number = document.createElement("strong");
  number.textContent = String(count);
  const label = document.createElement("span");
  label.textContent = "处美食";
  content.append(number, label);

  context.marker.setContent(content);
  context.marker.setAnchor("center");
}

function zoomIntoCluster(map, event) {
  const clusterData = event.clusterData ?? [];
  if (clusterData.length <= 1) {
    return;
  }

  const total = clusterData.reduce(
    (sum, point) => ({
      lng: sum.lng + getPointLng(point),
      lat: sum.lat + getPointLat(point),
    }),
    { lng: 0, lat: 0 },
  );
  const center = [total.lng / clusterData.length, total.lat / clusterData.length];
  map.setZoomAndCenter(Math.min(map.getZoom() + 2, 18), center);
}

function getPointLng(point) {
  return Array.isArray(point.lnglat)
    ? Number(point.lnglat[0])
    : Number(point.lnglat.lng);
}

function getPointLat(point) {
  return Array.isArray(point.lnglat)
    ? Number(point.lnglat[1])
    : Number(point.lnglat.lat);
}
