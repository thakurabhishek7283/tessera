import { createContext } from '@lit/context';
import type { TesseraInstance } from '@tessera-kit/core';

/** Provided by `<tessera-root>`; consumed by every {@link TesseraElement}. */
export const tesseraContext: ReturnType<typeof createContext<TesseraInstance>> =
  createContext<TesseraInstance>('tessera');
