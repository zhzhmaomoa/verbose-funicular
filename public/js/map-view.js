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
  const hoverState = createInfoWindowHoverState(infoWindow);
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
  map.on("movestart", () => {
    hoverState.cancelClose();
    infoWindow.close();
  });
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
  if (marker.__foodLocationId === location.id && marker.getContent?.()) {
    return;
  }

  marker.__foodLocationId = location.id;
  marker.setContent(createFoodMarkerContent(location));
  marker.setAnchor("bottom-center");
  marker.setExtData(location);

  // renderMarker 会随缩放反复调用，先移除旧监听避免重复触发。
  marker.off("mouseover");
  marker.off("mouseout");
  marker.on("mouseover", () => {
    hoverState.cancelClose();
    showFoodInfo(infoWindow, map, marker, location, hoverState);
  });
  marker.on("mouseout", hoverState.scheduleClose);
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
 * 标注和信息卡之间留出短暂的移入时间，同时允许卡片内部长期悬浮和滚动。
 * @param {AMap.InfoWindow} infoWindow
 */
function createInfoWindowHoverState(infoWindow) {
  let closeTimer = null;

  const cancelClose = () => {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      infoWindow.close();
    }, 220);
  };

  return {
    cancelClose,
    scheduleClose,
    onCardEnter: cancelClose,
    onCardLeave: scheduleClose,
  };
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
}
