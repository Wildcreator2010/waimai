import { BrowserWindow } from 'electron';
import { normalizeAppUrl } from './config';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(initialUrl: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<title>取餐提醒 · 首次设置</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
  main { padding: 26px 28px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p.lead { font-size: 13px; color: #475569; margin: 0 0 18px; line-height: 1.6; }
  label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
  input { width: 100%; padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; background: #fff; color: #0f172a; }
  input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
  .hint { font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.6; }
  .err { color: #dc2626; font-size: 12px; min-height: 18px; margin-top: 6px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  button { font-size: 14px; padding: 9px 18px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
  button.primary { background: #2563eb; color: #fff; }
  button.primary:hover { background: #1d4ed8; }
  button.ghost { background: #fff; border-color: #cbd5e1; color: #334155; }
  button.ghost:hover { background: #f1f5f9; }
</style>
</head>
<body>
<main>
  <h1>连接你的取餐提醒站点</h1>
  <p class="lead">桌面端直接加载 Web 站点地址（而不是本地文件），这样登录状态与 httpOnly Cookie 才能和后端保持同源。</p>
  <form id="f" autocomplete="off">
    <label for="url">站点地址</label>
    <input id="url" name="url" type="text" spellcheck="false" value="${escapeHtml(initialUrl)}" placeholder="https://meal.example.com" />
    <div class="hint">开发环境默认 http://127.0.0.1:5173；生产环境填写你自己的域名（需含 http:// 或 https://）。</div>
    <div class="err" id="err"></div>
    <div class="actions">
      <button class="ghost" type="button" id="cancel">退出</button>
      <button class="primary" type="submit">保存并启动</button>
    </div>
  </form>
</main>
<script>
  (function () {
    var form = document.getElementById('f');
    var input = document.getElementById('url');
    var err = document.getElementById('err');
    var cancel = document.getElementById('cancel');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = String(input.value || '').trim();
      var parsed = null;
      try { parsed = new URL(value); } catch (e) { parsed = null; }
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        err.textContent = '请输入以 http:// 或 https:// 开头的完整地址';
        input.focus();
        return;
      }
      err.textContent = '';
      window.__mealSetupSubmit(value);
    });
    cancel.addEventListener('click', function () {
      window.__mealSetupSubmit(null);
    });
    input.focus();
    input.select();
  })();
</script>
</body>
</html>`;
}

const SUBMIT_SCRIPT = `
new Promise((resolve) => {
  window.__mealSetupSubmit = (value) => resolve(value);
});
`;

/**
 * 首次运行设置窗口：极简内联 data: URL 表单，不引入任何前端框架。
 * 返回归一化后的站点地址；用户取消或关闭窗口返回 null。
 */
export function openSetupWindow(initialUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const win = new BrowserWindow({
      width: 540,
      height: 380,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      title: '取餐提醒 · 首次设置',
      backgroundColor: '#f8fafc',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => finish(null));

    const html = buildHtml(initialUrl);
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    win
      .loadURL(dataUrl)
      .then(() => win.webContents.executeJavaScript(SUBMIT_SCRIPT, true))
      .then((value: unknown) => {
        const chosen = typeof value === 'string' ? normalizeAppUrl(value) : null;
        finish(chosen);
        if (!win.isDestroyed()) win.close();
      })
      .catch((err: unknown) => {
        console.warn('[setup] 设置窗口异常:', err);
        finish(null);
        if (!win.isDestroyed()) win.close();
      });
  });
}
