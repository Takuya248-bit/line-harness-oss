import type { PostStatus } from '../types';

const styles: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  posted: 'bg-blue-100 text-blue-700',
};

const labels: Record<PostStatus, string> = {
  draft: 'Draft', pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected', posted: 'Posted',
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>{labels[status]}</span>;
}
