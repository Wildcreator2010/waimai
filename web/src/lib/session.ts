// 冷启动时是否需要尝试用 httpOnly cookie 换 access token。
//
// 说明：这里只存一个布尔标记，不存任何令牌 —— access token 在内存，
// refresh token 在 httpOnly cookie 里（JS 读不到）。没有这个标记的话，
// 每次打开页面都会先吃一个 401，控制台噪音大且多一次无效请求。

const SESSION_HINT_KEY = 'meal-reminder.has-session';

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    // 隐私模式下 localStorage 可能抛错，按「无会话」处理
    return false;
  }
}

export function markSessionHint(): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } catch {
    /* 忽略 */
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* 忽略 */
  }
}
