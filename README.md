# 美食地图

## 页面结构

桌面端地图始终铺满整个视口：

- 底层：高德地图与同址菜品九宫格。
- 上层：图片在上、两行极简信息在下，并由内容撑开高度的右侧单菜详情卡片。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `public/app.js` | 页面启动、数据加载和状态提示 |
| `public/js/map-view.js` | 地图初始化、聚合标记、悬浮选菜 |
| `public/js/marker-view.js` | 九宫格标记 DOM |
| `public/js/dish-panel.js` | 右侧单菜详情面板 |
| `public/js/data.js` | 接口分页、数据清洗、同址合并 |

交互只有一个方向：九宫格触发 `mouseover` / `pointerover` / 键盘聚焦 →
`map-view.js` 找到对应菜品 → `dish-panel.js` 显示右侧内容。
没有选中任何菜格时，详情卡片整体隐藏且不拦截地图操作。

## 启动

```bash
npm install
npm start
```

页面默认运行在 `http://localhost:60000`，并将 `/api` 代理到
`http://localhost:59998/api`。
