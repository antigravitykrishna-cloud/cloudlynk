import { useCallback, useRef, useState } from 'react';
import { EntryForm, propagateSeries, touchesSeriesFields } from '@/lib/video/uploadForm';

/** The Add Content forms, with series details carried forward to later episodes. */
export function useEntryForms() {
  const [entries, setEntries] = useState<EntryForm[]>([]);

  // Propagation is debounced: re-rendering every sibling entry on each
  // keystroke interrupts the TextInput IME (it used to drop all but the
  // first letter typed).
  const propagateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateEntry = useCallback((idx: number, patch: Partial<EntryForm>) => {
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
    if (!touchesSeriesFields(patch)) return;

    if (propagateTimer.current) clearTimeout(propagateTimer.current);
    propagateTimer.current = setTimeout(() => {
      setEntries(prev => propagateSeries(prev, idx));
    }, 250);
  }, []);

  const removeEntry = useCallback((idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const addEntries = useCallback((added: EntryForm[]) => {
    setEntries(prev => [...prev, ...added]);
  }, []);

  return { entries, updateEntry, removeEntry, addEntries };
}
