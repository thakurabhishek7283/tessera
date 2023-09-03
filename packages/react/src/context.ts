import type { TesseraInstance } from '@tessera/core';
import { createContext } from 'react';

export const TesseraReactContext: React.Context<TesseraInstance | null> =
  createContext<TesseraInstance | null>(null);
