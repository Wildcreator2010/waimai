import { FluentProvider } from '@fluentui/react-components';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { mealLightTheme } from './theme';

// 说明：这里刻意不包 StrictMode。开发模式下 StrictMode 会把 effect 执行两次，
// 而本应用的 /auth/refresh 是轮换制（旧 refresh 立即作废）、邮箱验证 token 是一次性的，
// 二次执行会把正常流程打成「令牌已失效」。生产构建行为不受影响。
const container = document.getElementById('root');
if (!container) throw new Error('缺少 #root 容器');

createRoot(container).render(
  <FluentProvider theme={mealLightTheme}>
    <App />
  </FluentProvider>,
);
