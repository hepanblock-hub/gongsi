import JsonLd from './JsonLd';

type QA = {
  question: string;
  answer: string;
};

type FaqJsonLdProps = {
  items: QA[];
};

export default function FaqJsonLd({ items }: FaqJsonLdProps) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((qa) => ({
          '@type': 'Question',
          name: qa.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: qa.answer,
          },
        })),
      }}
    />
  );
}
