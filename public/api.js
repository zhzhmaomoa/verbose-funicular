/**
 * 分页查询美食数据。
 * 接口地址与 friendly-octo-couscous/src/handler/foodRate.ts 中的 GET 路由对应。
 */
export async function asyncQuery(pageNum, pageSize) {
  const query = new URLSearchParams({ pageNum, pageSize }).toString();
  const response = await fetch(`/api/foodRate?${query}`, { method: "GET" });

  if (!response.ok) {
    throw new Error(`美食接口请求失败（HTTP ${response.status}）`);
  }

  const result = await response.json();
  if (!result.isSuccess) {
    throw new Error("美食接口返回失败，请检查后端服务");
  }

  return Array.isArray(result.data) ? result.data : [];
}
