import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/Feedback';

export function ForbiddenPage() {
  return (
    <EmptyState
      title="没有访问权限"
      description="该页面仅管理员可见。若你认为这是误判，请联系 ROOT 管理员。"
      action={
        <Link to="/reminders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          返回任务列表
        </Link>
      }
    />
  );
}
