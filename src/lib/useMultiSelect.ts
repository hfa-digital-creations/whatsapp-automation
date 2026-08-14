import { useState } from 'react';

export function useMultiSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  function clear() {
    setSelected(new Set());
  }

  return { selected, toggle, toggleAll, clear };
}
