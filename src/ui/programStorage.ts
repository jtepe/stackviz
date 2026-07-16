const PROGRAM_STORAGE_KEY = 'stackviz:program';

export function loadPersistedProgram(): string | null {
  try {
    return localStorage.getItem(PROGRAM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveProgram(source: string): void {
  try {
    localStorage.setItem(PROGRAM_STORAGE_KEY, source);
  } catch {
    return;
  }
}
