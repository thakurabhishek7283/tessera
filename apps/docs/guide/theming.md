# Theming

All colours, sizes and spacing come from CSS custom properties prefixed `--tessera-`. They cascade into every shadow root, so restyling needs no special API.

## Using the tokens

`@tessera/elements` installs the default tokens the first time an element connects. To control the cascade yourself, import the stylesheet:

```css
@import '@tessera/elements/tokens.css';
```

If the page already defines `--tessera-color-primary`, nothing is installed on top of it.

## Overriding

In CSS, anywhere above the elements:

```css
:root {
  --tessera-color-primary: #0f766e;
  --tessera-radius-md: 4px;
}
```

Or in the configuration, which applies them on `<tessera-root>`:

```ts
createTessera({
  appId: 'my-app',
  theme: { mode: 'auto', tokens: { '--tessera-color-primary': '#0f766e' } },
  features: {},
}, opts);
```

::: warning Keep contrast in mind
The default pairs are tested against WCAG 2.2 AA (4.5:1 for text, 3:1 for UI components and focus rings), in both light and dark. If you override a colour, check it against the colour it sits on.
:::

## Light, dark and auto

`theme.mode` is `light`, `dark` or `auto` (follow the OS). The resolved value is written to `data-tessera-theme` on `<tessera-root>`; without a root, tokens fall back to `prefers-color-scheme`. Switch at runtime with `instance.setTheme('dark')`.

## Token reference

| Group | Tokens |
| --- | --- |
| Colour | `--tessera-color-{bg,surface,surface-2,border,text,text-muted,primary,primary-contrast,danger,warning,success,focus-ring}` |
| Type | `--tessera-font-family`, `--tessera-font-size-{xs,sm,md,lg,xl}`, `--tessera-line-height` |
| Shape | `--tessera-radius-{sm,md,lg,full}`, `--tessera-shadow-{sm,md,lg}` |
| Spacing | `--tessera-space-{1…8}` (a 4 px scale) |
| Layering | `--tessera-z-{popover,dialog,toast}` |
| Motion | `--tessera-motion-duration` (0 ms when the user prefers reduced motion) |

## Parts and slots

Components expose `part` names on their main internals (`button`, `control`, `card`, `panel`, …) so you can style them from outside:

```css
tessera-textarea::part(control) {
  font-family: ui-monospace, monospace;
}
```
