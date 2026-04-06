'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type HeaderSearchProps = {
  states: Array<{ slug: string; name: string }>;
  citiesByState: Record<string, string[]>;
};

export default function HeaderSearch({ states, citiesByState }: HeaderSearchProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialState = searchParams.get('state') ?? '';
  const initialCity = searchParams.get('city') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState(initialState.toLowerCase());
  const [city, setCity] = useState(initialCity);

  const cityOptions = useMemo(() => {
    return state ? (citiesByState[state] ?? []) : [];
  }, [citiesByState, state]);

  return (
    <form action="/search" method="get" className="header-search" role="search">
      <input
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search company name"
        aria-label="Search company name"
      />

      <select
        name="state"
        aria-label="Select state"
        value={state}
        onChange={(e) => {
          const nextState = e.target.value;
          setState(nextState);
          setCity('');
        }}
      >
        <option value="">All states</option>
        {states.map((item) => (
          <option key={item.slug} value={item.slug}>{item.name}</option>
        ))}
      </select>

      <select
        name="city"
        aria-label="Select city"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        disabled={!state}
      >
        <option value="">{state ? 'All cities' : 'Select state first'}</option>
        {cityOptions.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>

      <button type="submit">Search</button>
    </form>
  );
}
