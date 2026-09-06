/** The visible preference must match the last successful persistent write. */
export async function commitPreferenceChange<T>(options: {
  previous: T;
  next: T;
  save: (value: T) => Promise<void>;
  apply: (value: T) => void;
}): Promise<boolean> {
  options.apply(options.next);
  try {
    await options.save(options.next);
    return true;
  } catch {
    options.apply(options.previous);
    return false;
  }
}
