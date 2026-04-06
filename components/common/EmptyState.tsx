type EmptyStateProps = {
  title: string;
  description: string;
};

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="card empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </section>
  );
}
