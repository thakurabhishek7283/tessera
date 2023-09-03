import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TesseraProvider } from '../src/index.js';

describe('server rendering', () => {
  it('renders the fallback and never touches window or customElements', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(
      <TesseraProvider config={{ appId: 'ssr', features: {} }} fallback={<p>loading</p>}>
        <p>client only</p>
      </TesseraProvider>,
    );
    expect(html).toBe('<p>loading</p>');
  });

  it('renders nothing when there is no fallback', () => {
    expect(
      renderToString(<TesseraProvider config={{ appId: 'ssr', features: {} }}>x</TesseraProvider>),
    ).toBe('');
  });
});
