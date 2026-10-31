import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 前端源码是浏览器 ES module；测试时通过 data URL 导入，无需改动服务端
// package.json 的 CommonJS 配置。
const source = await readFile(
  new URL("../public/js/map-viewport.js", import.meta.url),
  "utf8",
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { calculateFitViewport, fitMapToLocations } = await import(moduleUrl);

const chinaLocations = [
  { lng: 87.617733, lat: 43.792818 }, // 乌鲁木齐
  { lng: 121.473701, lat: 31.230416 }, // 上海
  { lng: 113.264385, lat: 23.129112 }, // 广州
  { lng: 116.407396, lat: 39.9042 }, // 北京
];

test("计算出的视口始终落在数据范围内，并包含全部地点", () => {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
    { width: 7680, height: 1080 },
  ]) {
    const result = calculateFitViewport(chinaLocations, viewport, {
      minZoom: 3,
      maxZoom: 16,
    });

    assert.ok(result, `${viewport.width}×${viewport.height} 应得到有效结果`);
    assert.ok(Number.isFinite(result.zoom));
    assert.ok(result.zoom >= 3 && result.zoom <= 16);
    assert.ok(result.center[0] > 80 && result.center[0] < 130);
    assert.ok(result.center[1] > 15 && result.center[1] < 50);

    const padding = Math.round(
      Math.min(
        96,
        Math.max(24, Math.min(viewport.width, viewport.height) * 0.06),
      ),
    );
    const worldPixels = 256 * 2 ** result.zoom;
    const centerWorld = project(result.center[0], result.center[1]);

    for (const location of chinaLocations) {
      const point = project(location.lng, location.lat);
      const x = viewport.width / 2 + (point.x - centerWorld.x) * worldPixels;
      const y = viewport.height / 2 + (point.y - centerWorld.y) * worldPixels;
      assert.ok(x >= padding && x <= viewport.width - padding);
      assert.ok(y >= padding && y <= viewport.height - padding);
    }
  }
});

test("0×0 的地图尺寸不会被当成可计算视口", () => {
  assert.equal(
    calculateFitViewport(chinaLocations, { width: 0, height: 0 }),
    null,
  );
});

function project(lng, lat) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI),
  };
}

test("地图尺寸从 0×0 恢复后才设置视口，不会先写入异常中心", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
  };

  let width = 0;
  let height = 0;
  const handlers = new Map();
  const viewportCalls = [];

  const map = {
    getContainer: () => ({ clientWidth: width, clientHeight: height }),
    getSize: () => ({ getWidth: () => width, getHeight: () => height }),
    getZooms: () => [2, 20],
    on: (type, handler) => handlers.set(type, handler),
    off: () => {},
    setZoomAndCenter: (zoom, center) => viewportCalls.push({ zoom, center }),
  };

  try {
    fitMapToLocations(map, chinaLocations);
    handlers.get("complete")?.();

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(viewportCalls.length, 0, "0×0 尺寸时不应设置视口");

    width = 1920;
    height = 1080;
    await new Promise((resolve) => setTimeout(resolve, 140));

    assert.equal(viewportCalls.length, 1);
    assert.ok(viewportCalls[0].center[1] > 15 && viewportCalls[0].center[1] < 50);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("单地点居中并放大到可读层级", () => {
  const result = calculateFitViewport(
    [{ lng: 121.473701, lat: 31.230416 }],
    { width: 1920, height: 1080 },
    { minZoom: 3, maxZoom: 16 },
  );

  assert.deepEqual(result, {
    zoom: 14,
    center: [121.473701, 31.230416],
  });
});
