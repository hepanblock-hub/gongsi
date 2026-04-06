type SearchBarProps = {
  action?: string;
  defaultQuery?: string;
  defaultState?: string;
};

export default function SearchBar({ action = '/search', defaultQuery = '', defaultState = '' }: SearchBarProps) {
  return (
    <form action={action} method="get" className="search-form" role="search">
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Company name"
        aria-label="Company name"
      />
      <input
        name="state"
        defaultValue={defaultState}
        placeholder="State (optional)"
        aria-label="State"
      />
      <button type="submit">Search</button>
    </form>
  );
}
