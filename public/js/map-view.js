import { createFoodMarkerContent } from "./marker-view.js";
import { createDishPanel } from "./dish-panel.js";
import { groupFoodsByLocation } from "./data.js";
import { fitMapToLocations } from "./map-viewport.js";

/**
 * 美食地图的主交互只有一条链路：
 *
 *   点击九宫格中的菜格 -> 高亮对应菜格 -> 打开右侧详情卡片
 *   点击卡片/标注以外的区域，或拖动、缩放地图 -> 关闭卡片
 *
 * 不再根据 hover 自动打开或延迟关闭卡片。这样 PC、移动端和电视端
 * 使用完全相同的状态机，也不会出现鼠标移向卡片时卡片先消失的问题。
 */

const CHINA_CENTER = [104.195397, 35.86166];

/**
 * 初始化高德地图。地图始终铺满视口，详情卡片作为右侧浮层覆盖在地图上方。
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
 * 创建聚合标注并安装统一的点击选择逻辑。
 *
 * @param {AMap.Map} map
 * @param {import("./data.js").FoodRate[]} foods
 * @param {HTMLElement} dishPanelElement
 */
export function addFoodMarkers(map, foods, dishPanelElement) {
  let selectionController = null;
  const dishPanel = createDishPanel(dishPanelElement, {
    // 面板无论由谁关闭（外部点击、地图移动或 Escape），都同步清理标注选中态。
    onHide: () => selectionController?.clear(),
  });
  selectionController = createSelectionController(dishPanel);

  const locations = groupFoodsByLocation(foods);
  const points = locations.map((location) => ({
    ...location,
    lnglat: [location.lng, location.lat],
  }));

  const cluster = new window.AMap.MarkerCluster(map, points, {
    gridSize: 100,
    maxZoom: 16,
    renderMarker: (context) =>
      renderFoodMarker(context, points, selectionController),
    renderClusterMarker: renderClusterMarker,
  });

  // 聚合点点击后放大，直到拆成更小的聚合点或单个地点标注。
  cluster.on("click", (event) => zoomIntoCluster(map, event));

  // 地图拖动、缩放时卡片会与标注位置错开，因此把它视同“点击了地图外部”。
  // movestart 同时覆盖拖拽和滚轮/触摸缩放；dragstart 作为旧电视浏览器的兜底。
  map.on("movestart", selectionController.hide);
  map.on("dragstart", selectionController.hide);
  map.on("zoomstart", selectionController.hide);

  const onDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      selectionController.hide();
      return;
    }

    // 点击卡片内部保持当前选择；点击标注由标注自己的 click 处理。
    if (target.closest(".dish-panel, .food-marker")) {
      return;
    }

    selectionController.hide();
  };

  const onDocumentKeyDown = (event) => {
    if (event.key === "Escape") {
      selectionController.hide();
    }
  };

  // 捕获阶段监听可以处理地图、聚合点、控制条以及页面空白处等所有“外部点击”。
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeyDown);

  // 启动时一次性展示全部地点；卡片默认隐藏，所以无需给右侧卡片预留视口。
  fitMapToLocations(map, locations);

  return {
    cluster,
    locations,
    dispose() {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeyDown);
      map.off?.("movestart", selectionController.hide);
      map.off?.("dragstart", selectionController.hide);
      map.off?.("zoomstart", selectionController.hide);
      selectionController.hide();
    },
  };
}

/**
 * MarkerCluster 绘制单个地点时调用。地图移动会反复触发 renderMarker，
 * 因此同一地点复用原 DOM，避免图片重新加载和事件重复绑定。
 */
function renderFoodMarker(context, points, selectionController) {
  const location =
    context.data?.[0] ?? findLocationByMarker(context.marker, points);
  if (!location) {
    return;
  }

  const marker = context.marker;
  let content = marker.getContent?.();

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
  bindDishSelection(content, location, selectionController);
}

/**
 * 每个地点标记内部只绑定一次事件委托。
 * click 负责主要交互，Enter/Space 保留键盘可访问性。
 */
function bindDishSelection(content, location, selectionController) {
  if (content.dataset.selectionBound === "true") {
    return;
  }
  content.dataset.selectionBound = "true";

  const selectFromTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    // 点在菜格内时展示对应菜；点在标记留白/“+N”徽标上时展示第一道可见菜。
    const dishElement =
      target.closest(".food-marker__dish") ??
      content.querySelector(".food-marker__dish");
    if (!dishElement || !content.contains(dishElement)) {
      return false;
    }

    selectionController.show(content, location, dishElement);
    return true;
  };

  content.addEventListener("click", (event) => {
    if (!selectFromTarget(event.target)) {
      return;
    }

    // 阻止事件继续传给高德地图，避免同一次点击又被判定为地图点击。
    event.stopPropagation();
  });

  content.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (!selectFromTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  });
}

/**
 * 单一选中状态控制器：同一时刻最多只有一个标注处于激活状态。
 * 标注 DOM 只负责呈现，详情卡片只负责显示，二者由这里同步。
 */
function createSelectionController(dishPanel) {
  let activeContent = null;

  const show = (content, location, dishElement) => {
    const dishIndex = Number(dishElement.dataset.dishIndex);
    const food = location.dishes[dishIndex];
    if (!food) {
      return;
    }

    if (activeContent && activeContent !== content) {
      setActiveDish(activeContent, null);
      setMarkerActive(activeContent, false);
    }

    activeContent = content;
    setActiveDish(content, dishElement);
    setMarkerActive(content, true);
    dishPanel.showDish(location, food);
  };

  const clear = () => {
    if (!activeContent) {
      return;
    }

    setActiveDish(activeContent, null);
    setMarkerActive(activeContent, false);
    activeContent = null;
  };

  const hide = () => {
    dishPanel.hideDish();
    clear();
  };

  return { show, hide, clear };
}

function setActiveDish(content, activeDishElement) {
  for (const dishElement of content.querySelectorAll(".food-marker__dish")) {
    const isActive = dishElement === activeDishElement;
    dishElement.classList.toggle("is-active", isActive);
    dishElement.setAttribute("aria-pressed", String(isActive));
  }
}

function setMarkerActive(content, isActive) {
  content.classList.toggle("is-active", isActive);
  content
    .closest(".amap-marker")
    ?.classList.toggle("is-food-marker-active", isActive);
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
