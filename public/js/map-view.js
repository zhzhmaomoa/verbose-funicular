import {
  createFoodInfoWindow,
  createFoodMarkerContent,
  showFoodInfo,
} from "./marker-view.js";
import { groupFoodsByLocation } from "./data.js";

/**
 * 点标记选型说明（后续数据增长时不要随意换回普通 Marker）：
 * - AMap.Marker：每个点一个 DOM，样式简单，但几千个点就容易卡顿。
 * - AMap.MassMarks：适合十万级纯图标，但不能在点内直接显示标题。
 * - AMap.LabelMarker：适合海量图标 + 文本，但没有现成的近距离聚合。
 * - AMap.ElasticMarker：适合随缩放自动换样式的图标，不适合做聚合。
 * - AMap.MarkerCluster：只渲染当前可见点，并自动聚合相近点；
 *   同时支持 renderMarker 自定义图片 + 标题，最符合本页需求。
 *
 * 因此这里使用 MarkerCluster，而不是手动创建一大组 AMap.Marker。
 * 数据继续增长时，优先保留 MarkerCluster，再考虑服务端按可视区域返回数据。
 */
const CHINA_CENTER = [104.195397, 35.86166];
const HOVER_CLOSE_DELAY = 420;
const clusterHoverHandlers = new WeakMap();

/**
 * 初始化高德地图。地图本身只负责底图和缩放。
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
 * 准备聚合数据并自定义每个美食标记。
 * 高德 JS API 2.0 的 MarkerCluster 会接收经纬度数据，再通过 renderMarker 绘制标记。
 * @param {AMap.Map} map
 * @param {import("./data.js").FoodRate[]} foods
 */
export function addFoodMarkers(map, foods) {
  const infoWindow = createFoodInfoWindow();
  const hoverState = createMarkerHoverController(map, infoWindow);
  const locations = groupFoodsByLocation(foods);
  const points = locations.map((location) => ({
    ...location,
    lnglat: [location.lng, location.lat],
  }));

  const cluster = new window.AMap.MarkerCluster(map, points, {
    gridSize: 100,
    maxZoom: 16,
    renderMarker: (context) =>
      renderFoodMarker(context, map, infoWindow, points, hoverState),
    renderClusterMarker: renderClusterMarker,
  });

  // 点击聚合点时再放大，直到拆成更小的聚合点或单个标记。
  cluster.on("click", (event) => zoomIntoCluster(map, event));

  // 地图移动或缩放时关闭旧卡片，避免卡片和标注位置错开。
  map.on("movestart", hoverState.reset);
  fitMapToLocations(map, locations);

  return { cluster, infoWindow, locations };
}

function fitMapToLocations(map, locations) {
  if (locations.length === 0) {
    return;
  }

  if (locations.length === 1) {
    map.setZoomAndCenter(14, [locations[0].lng, locations[0].lat]);
    return;
  }

  const lngList = locations.map((location) => location.lng);
  const latList = locations.map((location) => location.lat);
  const southWest = [Math.min(...lngList), Math.min(...latList)];
  const northEast = [Math.max(...lngList), Math.max(...latList)];
  const bounds = new window.AMap.Bounds(southWest, northEast);
  const padding = [150, 150, 150, 150];
  const [zoom, center] = map.getFitZoomAndCenterByBounds(bounds, padding, 16);
  map.setZoomAndCenter(zoom, center);
}

/**
 * renderMarker 是 MarkerCluster 绘制单个地点时调用的回调。
 * context.data[0] 就是上一步传入的某一个地点及其菜品列表。
 */
function renderFoodMarker(context, map, infoWindow, points, hoverState) {
  const location = context.data?.[0] ?? findFoodByMarker(context.marker, points);
  if (!location) {
    return;
  }

  const marker = context.marker;
  // 拖动地图时 MarkerCluster 可能反复调用 renderMarker。同一地点直接复用
  // 已有内容，避免图片节点被重建后重新加载而闪烁。
  if (marker.__foodLocationId !== location.id || !marker.getContent?.()) {
    marker.__foodLocationId = location.id;
    marker.setContent(createFoodMarkerContent(location));
  }

  marker.setAnchor("bottom-center");
  marker.setExtData(location);
  hoverState.attachMarker(marker, location.id);
}

function setMarkerActive(marker, isActive) {
  const content = marker.getContent?.();
  const markerElement =
    content?.closest?.(".amap-marker") ?? content?.parentElement;
  content?.classList?.toggle("is-active", isActive);
  markerElement?.classList.toggle("is-food-marker-active", isActive);
}

function findFoodByMarker(marker, points) {
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

/**
 * 统一管理 marker 高亮、卡片打开和关闭。
 *
 * 电视浏览器即使连接鼠标，也可能只触发 mousemove 而遗漏 AMap Marker 的
 * mouseover；因此这里不再把 mouseover 当作唯一入口，而是同时使用：
 * 1. AMap Marker 的 mouseover/mousemove/click；
 * 2. 标注 DOM 的 pointerenter/mouseenter/click；
 * 3. 文档捕获阶段的指针移动 + elementFromPoint 命中检测。
 *
 * 三类事件最终都进入同一套幂等状态，重复触发不会重建卡片或导致闪烁。
 * @param {AMap.Map} map
 * @param {AMap.InfoWindow} infoWindow
 */
function createMarkerHoverController(map, infoWindow) {
  let closeTimer = null;
  let isCardHovered = false;
  let activeLocationId = null;
  let activeMarker = null;
  let openLocationId = null;
  let pointerPosition = null;
  const markersByLocationId = new Map();
  const markerBindings = new WeakMap();
  const boundMarkerContents = new WeakSet();
  const boundCards = new WeakSet();

  const cancelClose = () => {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const setInfoWindowActive = (isActive) => {
    (map.getContainer()?.querySelector(".amap-info") ??
      document.querySelector(".amap-info"))
      ?.classList.toggle("is-food-card-active", isActive);
  };

  const deactivateMarker = () => {
    if (activeMarker) {
      setMarkerActive(activeMarker, false);
    }
    activeMarker = null;
    activeLocationId = null;
  };

  const pointerIsOnActiveSurface = () => {
    if (!pointerPosition) {
      return false;
    }

    const element = document.elementFromPoint(
      pointerPosition.x,
      pointerPosition.y,
    );
    if (element?.closest(".food-card")) {
      return true;
    }

    const markerElement = element?.closest(".food-marker");
    return markerElement?.dataset.locationId === activeLocationId;
  };

  const scheduleClose = (expectedLocationId) => {
    const expectedId =
      expectedLocationId == null ? null : String(expectedLocationId);
    if (expectedId !== null && expectedId !== activeLocationId) {
      return;
    }

    if (isCardHovered) {
      return;
    }

    cancelClose();
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (isCardHovered || pointerIsOnActiveSurface()) {
        return;
      }

      deactivateMarker();
      setInfoWindowActive(false);
      openLocationId = null;
      infoWindow.close();
    }, HOVER_CLOSE_DELAY);
  };

  const setCardHovered = (nextHovered) => {
    if (isCardHovered === nextHovered) {
      return;
    }

    isCardHovered = nextHovered;
    if (nextHovered) {
      cancelClose();
    } else {
      scheduleClose();
    }
  };

  const bindCard = (card) => {
    if (!(card instanceof Element) || boundCards.has(card)) {
      return;
    }

    boundCards.add(card);
    card.addEventListener("pointerenter", () => setCardHovered(true));
    card.addEventListener("mouseenter", () => setCardHovered(true));
    card.addEventListener("pointerleave", () => setCardHovered(false));
    card.addEventListener("mouseleave", () => setCardHovered(false));
  };

  const openMarker = (locationId) => {
    const id = String(locationId);
    const marker = markersByLocationId.get(id);
    const location = marker?.getExtData?.();
    if (!marker || !location) {
      return;
    }

    isCardHovered = false;
    cancelClose();

    if (activeLocationId !== id) {
      deactivateMarker();
      activeLocationId = id;
      activeMarker = marker;
      setMarkerActive(marker, true);
    }

    setInfoWindowActive(true);
    if (openLocationId === id && infoWindow.getIsOpen?.() !== false) {
      return;
    }

    const card = showFoodInfo(infoWindow, map, marker, location);
    openLocationId = id;
    bindCard(card);
  };

  const attachMarker = (marker, locationId) => {
    const id = String(locationId);
    markersByLocationId.set(id, marker);

    const content = marker.getContent?.();
    if (content instanceof Element && !boundMarkerContents.has(content)) {
      boundMarkerContents.add(content);
      content.addEventListener("pointerenter", () => openMarker(id));
      content.addEventListener("mouseenter", () => openMarker(id));
      content.addEventListener("pointerleave", () => scheduleClose(id));
      content.addEventListener("mouseleave", () => scheduleClose(id));
      content.addEventListener("click", (event) => {
        event.stopPropagation();
        openMarker(id);
      });
    }

    const previous = markerBindings.get(marker);
    if (previous) {
      marker.off("mouseover", previous.onOver);
      marker.off("mousemove", previous.onMove);
      marker.off("mouseout", previous.onOut);
      marker.off("click", previous.onClick);
    }

    const handlers = {
      onOver: () => openMarker(id),
      onMove: () => openMarker(id),
      onOut: () => scheduleClose(id),
      onClick: () => openMarker(id),
    };
    marker.on("mouseover", handlers.onOver);
    marker.on("mousemove", handlers.onMove);
    marker.on("mouseout", handlers.onOut);
    marker.on("click", handlers.onClick);
    markerBindings.set(marker, handlers);
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      pointerPosition = { x: event.clientX, y: event.clientY };
    }

    const pointerElement = findPointerElement(event);
    const card = pointerElement?.closest(".food-card");
    if (card) {
      setCardHovered(true);
      return;
    }

    const markerElement = pointerElement?.closest(".food-marker");
    const markerId = markerElement?.dataset.locationId;
    if (markerId && markersByLocationId.has(markerId)) {
      openMarker(markerId);
      return;
    }

    if (activeLocationId !== null || isCardHovered) {
      deactivateMarker();
      setCardHovered(false);
      scheduleClose();
    }
  };

  const reset = () => {
    cancelClose();
    isCardHovered = false;
    openLocationId = null;
    deactivateMarker();
    setInfoWindowActive(false);
    infoWindow.close();
  };

  document.addEventListener("pointermove", handlePointerMove, {
    capture: true,
    passive: true,
  });
  document.addEventListener("mousemove", handlePointerMove, {
    capture: true,
    passive: true,
  });

  infoWindow.on?.("close", () => {
    if (infoWindow.getIsOpen?.()) {
      return;
    }

    openLocationId = null;
    window.setTimeout(() => {
      if (openLocationId !== null) {
        return;
      }

      isCardHovered = false;
      deactivateMarker();
      setInfoWindowActive(false);
    }, 0);
  });

  return {
    attachMarker,
    reset,
  };
}

function findPointerElement(event) {
  const directTarget = event.target instanceof Element ? event.target : null;
  if (directTarget?.closest(".food-card, .food-marker")) {
    return directTarget;
  }

  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return directTarget;
  }

  return document.elementFromPoint(event.clientX, event.clientY);
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

/**
 * 聚合点使用自定义圆形样式，数字越大，圆点稍微放大。
 */
function renderClusterMarker(context) {
  const count = Number(context.count) || 1;
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
  context.marker.setOffset(new window.AMap.Pixel(-size / 2, -size / 2));

  const marker = context.marker;
  const previous = clusterHoverHandlers.get(marker);
  if (previous) {
    marker.off("mouseover", previous.onOver);
    marker.off("mouseout", previous.onOut);
  }

  const handlers = {
    onOver: () => setMarkerActive(marker, true),
    onOut: () => setMarkerActive(marker, false),
  };
  marker.on("mouseover", handlers.onOver);
  marker.on("mouseout", handlers.onOut);
  clusterHoverHandlers.set(marker, handlers);
}
