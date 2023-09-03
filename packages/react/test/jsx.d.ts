import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'react-test-counter': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
