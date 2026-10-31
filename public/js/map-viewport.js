/**
 * 启动时的地图视口适配。
 *
 * 这里刻意不依赖 AMap 的 getFitZoomAndCenterByBounds：
 * - 它的 padding 顺序是“上、下、左、右”，很容易把卡片宽度误当成下边距；
 * - 电视浏览器初始化时可能短暂返回 0×0 的地图尺寸，旧逻辑仍会继续计算，
 *   最终得到异常的中心点。
 *
 * 现在改为先等待有效尺寸，再用标准 Web Mercator 投影自行计算 zoom/center。
 * 卡片默认隐藏，所以启动阶段不需要给右侧卡片预留空间，只需留出安全的四周留白。
 */

const TILE_SIZE = 256;
const WEB_MERCATOR_MAX_LAT = 85.05112878;
const MIN_VIEWPORT_SIDE = 120;
const MAX_FIT_ATTEMPTS = 20;
const RETRY_DELAY_MS = 50;
const MAP_COMPLETE_FALLBACK_MS = 1200;
const MIN_MARKER_PADDING = 24;
const MAX_MARKER_PADDING = 96;
const MARKER_PADDING_RATIO = 0.06;
const SINGLE_LOCATION_ZOOM = 14;
const MAX_START_FIT_ZOOM = 16;

/**
 * 根据地点坐标和地图可用尺寸计算最终视口。
 * 该函数不访问 DOM/AMap，方便单测和后续复用。
 *
 * @param {{lng: number, lat: number}[]} locations
 * @param {{width: number, height: number}} viewport
 * @param {{minZoom?: number, maxZoom?: number}} [options]
 * @returns {{zoom: number, center: [number, number]} | null}
 */
export function calculateFitViewport(locations, viewport, options = {}) {
  const points = locations.filter(
    (location) =>
      Number.isFinite(location.lng) &&
      Number.isFinite(location.lat) &&
      Math.abs(location.lat) <= WEB_MERCATOR_MAX_LAT,
  );

  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (
    points.length === 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_VIEWPORT_SIDE ||
    height < MIN_VIEWPORT_SIDE
  ) {
    return null;
  }

  const minZoom = toFiniteZoom(options.minZoom, 0);
  const maxZoom = Math.max(minZoom, toFiniteZoom(options.maxZoom, 20));

  if (points.length === 1) {
    return {
      zoom: clamp(SINGLE_LOCATION_ZOOM, minZoom, maxZoom),
      center: [points[0].lng, points[0].lat],
    };
  }

  // Web Mercator 的归一化世界坐标：x/y 都在 [0, 1] 内。
  // 这样同一套公式可以同时适配手机、PC 和电视，不受 DPR/CSS 尺寸影响。
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // 用循环统计边界，避免地点数量很大时 Math.max(...array) 触发参数上限。
  for (const point of points) {
    const projected = projectToWorld(point.lng, point.lat);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }

  const padding = calculatePadding(width, height);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);

  // x/y 都可能退化为 0（例如所有点经度相同），给一个极小的跨度避免 Infinity。
  const xSpan = Math.max(maxX - minX, Number.EPSILON);
  const ySpan = Math.max(maxY - minY, Number.EPSILON);
  const rawZoom = Math.log2(
    Math.min(
      availableWidth / (TILE_SIZE * xSpan),
      availableHeight / (TILE_SIZE * ySpan),
    ),
  );

  // 向下取整，确保带物理尺寸的标注不会被放在视口边缘之外。
  const zoom = clamp(Math.floor(rawZoom), minZoom, maxZoom);
  const center = unprojectFromWorld((minX + maxX) / 2, (minY + maxY) / 2);

  return {
    zoom,
    center: [center.lng, center.lat],
  };
}

/**
 * 等地图容器真正拥有尺寸后再适配。电视端 WebView 初始化慢时，
 * 0×0 尺寸只会触发短暂重试，不会把地图送到无效坐标（例如南极）。
 *
 * @param {AMap.Map} map
 * @param {{lng: number, lat: number}[]} locations
 */
export function fitMapToLocations(map, locations) {
  let attempts = 0;
  let retryTimer = null;
  let frameId = null;
  let readyFallbackTimer = null;
  let finished = false;

  const cleanup = () => {
    finished = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (readyFallbackTimer !== null) {
      window.clearTimeout(readyFallbackTimer);
      readyFallbackTimer = null;
    }
    map.off?.("complete", onMapComplete);
  };

  const scheduleFit = () => {
    if (finished || retryTimer !== null) {
      return;
    }

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      frameId = window.requestAnimationFrame(tryFit);
    }, attempts === 0 ? 0 : RETRY_DELAY_MS);
  };

  const tryFit = () => {
    frameId = null;
    if (finished) {
      return;
    }

    const viewport = readMapViewport(map);
    const zooms = readMapZooms(map);
    const fit = calculateFitViewport(locations, viewport, zooms);

    if (!fit) {
      attempts += 1;
      if (attempts <= MAX_FIT_ATTEMPTS) {
        scheduleFit();
      } else {
        // 极端情况下保底回到中国中心，至少不会停留在无效的南极坐标。
        map.setZoomAndCenter(5, [104.195397, 35.86166]);
        cleanup();
      }
      return;
    }

    map.setZoomAndCenter(fit.zoom, fit.center);
    cleanup();
  };

  function onMapComplete() {
    if (readyFallbackTimer !== null) {
      window.clearTimeout(readyFallbackTimer);
      readyFallbackTimer = null;
    }
    scheduleFit();
  }

  // 优先等 AMap 的 complete 事件，避免在底图尚未就绪时设置视口。
  // 部分电视 WebView 不触发 complete，因此 1.2 秒后改用安全的尺寸重试兜底。
  map.on?.("complete", onMapComplete);
  readyFallbackTimer = window.setTimeout(() => {
    readyFallbackTimer = null;
    scheduleFit();
  }, MAP_COMPLETE_FALLBACK_MS);
}

function readMapViewport(map) {
  const container = map.getContainer?.();
  const amapSize = map.getSize?.();
  const width =
    Number(container?.clientWidth) ||
    Number(amapSize?.getWidth?.()) ||
    Number(amapSize?.width) ||
    0;
  const height =
    Number(container?.clientHeight) ||
    Number(amapSize?.getHeight?.()) ||
    Number(amapSize?.height) ||
    0;

  return { width, height };
}

function readMapZooms(map) {
  const zooms = map.getZooms?.();
  return {
    minZoom: Number(zooms?.[0]) || 0,
    maxZoom: Math.min(Number(zooms?.[1]) || MAX_START_FIT_ZOOM, MAX_START_FIT_ZOOM),
  };
}

function calculatePadding(width, height) {
  const shortestSide = Math.min(width, height);
  return Math.round(
    clamp(
      shortestSide * MARKER_PADDING_RATIO,
      MIN_MARKER_PADDING,
      MAX_MARKER_PADDING,
    ),
  );
}

function projectToWorld(lng, lat) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y:
      0.5 -
      Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI),
  };
}

function unprojectFromWorld(x, y) {
  return {
    lng: x * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  };
}

function toFiniteZoom(value, fallback) {
  const zoom = Number(value);
  return Number.isFinite(zoom) ? zoom : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
