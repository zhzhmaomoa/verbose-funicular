const AMAP_SCRIPT_ID = "amap-jsapi-script";

let loadingPromise = null;

/**
 * 动态加载高德地图 JS API 和 MarkerCluster 聚合插件。
 * env.js 里如果提供了 securityJsCode，也会一并配置。
 */
export function loadAMap(apiKey, securityJsCode) {
  if (window.AMap?.MarkerCluster) {
    return Promise.resolve(window.AMap);
  }

  if (!apiKey || apiKey.trim() === "" || apiKey === "123") {
    return Promise.reject(
      new Error("请先在 public/env.js 中填写高德地图 Web 端 JS API Key"),
    );
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode };
  }

  loadingPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(AMAP_SCRIPT_ID);
    const script = existingScript ?? document.createElement("script");

    script.id = AMAP_SCRIPT_ID;
    script.async = true;
    script.src = buildAMapUrl(apiKey);
    script.onload = () => {
      if (!window.AMap) {
        reject(new Error("高德地图加载失败，请检查 Key 和网络连接"));
        return;
      }

      // 确保聚合插件已经注册完成后再交给页面使用。
      window.AMap.plugin("AMap.MarkerCluster", () => resolve(window.AMap));
    };
    script.onerror = () => {
      reject(new Error("无法连接高德地图，请检查网络或 API Key"));
    };

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  return loadingPromise;
}

function buildAMapUrl(apiKey) {
  const params = new URLSearchParams({
    v: "2.0",
    key: apiKey,
    plugin: "AMap.MarkerCluster",
  });
  return `https://webapi.amap.com/maps?${params.toString()}`;
}
