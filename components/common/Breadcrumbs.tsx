type Crumb = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: Crumb[];
};

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`}>
            {item.href && !isLast ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
            {!isLast ? ' / ' : ''}
          </span>
        );
      })}
    </nav>
  );
}
