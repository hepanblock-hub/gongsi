type PageTitleProps = {
  title: string;
  description?: string;
};

export default function PageTitle({ title, description }: PageTitleProps) {
  return (
    <header className="page-title">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}
