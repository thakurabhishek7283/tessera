import { createContext } from '@lit/context';
import type { TesseraInstance } from '@tessera/core';

/** Provided by `<tessera-root>`; consumed by every {@link TesseraElement}. */
export const tesseraContext: ReturnType<typeof createContext<TesseraInstance>> =
  createContext<TesseraInstance>('tessera');
