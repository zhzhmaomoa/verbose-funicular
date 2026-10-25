/**
 * 给左上角按钮绑定浏览器的全屏/退出全屏能力。
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} target 需要进入全屏的元素
 * @param {() => void} onFullscreenChange 全屏状态变化后的回调
 */
export function setupFullscreenButton(button, target, onFullscreenChange) {
  const label = button.querySelector("#fullscreen-label");
  const icon = button.querySelector("#fullscreen-icon");

  if (!target.requestFullscreen) {
    button.disabled = true;
    label.textContent = "浏览器不支持全屏";
    return;
  }

  button.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (error) {
      console.error("切换全屏失败：", error);
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    button.setAttribute("aria-pressed", String(isFullscreen));
    label.textContent = isFullscreen ? "退出全屏" : "全屏";
    icon.textContent = isFullscreen ? "⤡" : "⛶";
    onFullscreenChange();
  });
}
