/** markdown-it plugins that ship without type declarations. */

declare module 'markdown-it-footnote' {
  const plugin: unknown;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  const plugin: unknown;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  const plugin: unknown;
  export default plugin;
}

declare module 'markdown-it-emoji' {
  export const bare: unknown;
  export const full: unknown;
  export const light: unknown;
}
