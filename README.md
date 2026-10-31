# 美食地图

## 页面结构

桌面端地图始终铺满整个视口：

- 底层：高德地图与同址菜品九宫格。
- 上层：图片在上、两行极简信息在下，并由内容撑开高度的右侧单菜详情卡片。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `public/app.js` | 页面启动、数据加载和状态提示 |
| `public/js/map-view.js` | 地图初始化、聚合标记、点击选中与关闭逻辑 |
| `public/js/map-viewport.js` | 启动时按真实地图尺寸适配全部标注 |
| `public/js/marker-view.js` | 九宫格标记 DOM |
| `public/js/dish-panel.js` | 右侧单菜详情面板 |
| `public/js/data.js` | 接口分页、数据清洗、同址合并 |

交互在 PC、移动端和电视端完全一致：

1. 点击九宫格菜格 → 高亮菜格 → `dish-panel.js` 显示右侧详情卡片。
2. 点击卡片内部不会关闭卡片；点击卡片和标注以外的区域会关闭。
3. 拖动或缩放地图会关闭卡片，避免卡片与标注位置错开。
4. 键盘聚焦菜格后按 Enter / Space 也可打开，按 Escape 关闭。

启动时的视口适配位于 `map-viewport.js`。它会等待地图容器获得真实尺寸，
再按 Web Mercator 投影计算能容纳全部地点的 zoom/center；尺寸仍为 0 时只重试，
不会继续执行错误计算。卡片默认隐藏，因此启动阶段不需要为右侧卡片留白。

## 启动

```bash
npm install
npm start
```

页面默认运行在 `http://localhost:60000`，并将 `/api` 代理到
`http://localhost:59998/api`。
