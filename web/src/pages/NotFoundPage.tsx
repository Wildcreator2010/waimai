import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/Feedback';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState
        title="页面不存在"
        description="链接可能已失效，或该功能尚未开放。"
        action={
          <Link to="/reminders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            返回任务列表
          </Link>
        }
      />
    </div>
  );
}
