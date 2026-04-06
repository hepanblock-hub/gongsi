type StatusBadgeProps = {
  label: string;
  tone?: 'good' | 'warn' | 'neutral';
};

export default function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
