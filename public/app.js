import * as env from "./env.js";
import { loadAMap } from "./js/amap-loader.js";
import { loadAllFoodRates } from "./js/data.js";
import { setupFullscreenButton } from "./js/fullscreen.js";
import { addFoodMarkers, createFoodMap } from "./js/map-view.js";

const elements = {
  mapPage: document.querySelector("#map-page"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  statusPanel: document.querySelector("#status-panel"),
  statusText: document.querySelector("#status-text"),
  dishPanel: document.querySelector("#dish-panel"),
};

let map = null;

setupFullscreenButton(elements.fullscreenButton, elements.mapPage, () => {
  // 全屏尺寸变化后通知地图重新计算画布大小。
  window.setTimeout(() => map?.resize(), 120);
});

startPage();

async function startPage() {
  try {
    showStatus("正在加载地图…");
    await loadAMap(env.apikey, env.securityJsCode);

    map = createFoodMap("map");
    showStatus("正在读取美食数据…");

    const foods = await loadAllFoodRates();

    if (foods.length === 0) {
      showStatus("暂时没有美食数据");
      return;
    }

    addFoodMarkers(map, foods, elements.dishPanel);
    hideStatus();
  } catch (error) {
    console.error(error);
    showStatus(error.message || "页面加载失败，请稍后重试", true);
  }
}

function showStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusPanel.classList.toggle("is-error", isError);
  elements.statusPanel.hidden = false;
}

function hideStatus() {
  elements.statusPanel.hidden = true;
}
