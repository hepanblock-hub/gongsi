type SectionCardProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export default function SectionCard({ title, children, className = '' }: SectionCardProps) {
  return (
    <section className={`card ${className}`.trim()}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
