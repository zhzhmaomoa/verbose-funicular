import { asyncQuery } from "../api.js";

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

/**
 * 对应 friendly-octo-couscous/src/types/foodRate.ts 中的 FoodRateType。
 * @typedef {Object} FoodRate
 * @property {string} id
 * @property {string} date
 * @property {string} title
 * @property {string} desc
 * @property {number} rate
 * @property {string} imageSrc
 * @property {number} lat 纬度
 * @property {number} lng 经度
 */

/**
 * 同一地点的多道菜。地图上一个地点只生成一个 Marker。
 * @typedef {Object} FoodLocation
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {FoodRate[]} dishes
 */

/**
 * 逐页读取全部美食数据，避免只显示第一页。
 * @returns {Promise<FoodRate[]>}
 */
export async function loadAllFoodRates() {
  const foods = [];

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
    const page = await asyncQuery(pageNum, PAGE_SIZE);
    const validFoods = page.map(normalizeFoodRate).filter(Boolean);
    foods.push(...validFoods);

    // 返回数量小于一页，说明已经读到最后一页。
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return foods;
}

/**
 * 把经纬度相同的菜品合并为一个地点。保留五位小数，约等于亚米级精度，
 * 可以合并接口中重复定位产生的细微坐标误差，又不会误合并附近不同餐厅。
 * @param {FoodRate[]} foods
 * @returns {FoodLocation[]}
 */
export function groupFoodsByLocation(foods) {
  const groups = new Map();

  for (const food of foods) {
    const key = `${food.lng.toFixed(5)},${food.lat.toFixed(5)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.dishes.push(food);
      continue;
    }

    groups.set(key, {
      id: `location-${key}`,
      lng: food.lng,
      lat: food.lat,
      dishes: [food],
    });
  }

  return Array.from(groups.values());
}

/**
 * 把接口中的字符串数字转成数字，并过滤坐标无效的数据。
 * @param {Record<string, unknown>} item
 * @returns {FoodRate | null}
 */
function normalizeFoodRate(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  const rate = Number(item.rate);
  const title = String(item.title ?? "").trim();
  const id = String(item.id ?? "").trim();

  if (!id || !title || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id,
    title,
    date: String(item.date ?? ""),
    desc: String(item.desc ?? ""),
    imageSrc: String(item.imageSrc ?? ""),
    rate: Number.isFinite(rate) ? rate : 0,
    lat,
    lng,
  };
}
