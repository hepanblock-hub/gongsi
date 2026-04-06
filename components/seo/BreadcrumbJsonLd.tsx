import JsonLd from './JsonLd';

type Item = {
  name: string;
  item: string;
};

type BreadcrumbJsonLdProps = {
  items: Item[];
};

export default function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((entry, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: entry.name,
          item: entry.item,
        })),
      }}
    />
  );
}
