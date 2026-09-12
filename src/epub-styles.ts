export const EPUB_STYLES_PATH = "styles/fileshape.css";
export const EPUB_STYLES_HREF_FROM_TEXT = "../styles/fileshape.css";
export const EPUB_STYLES_HREF_FROM_NAV = "styles/fileshape.css";

/**
 * Conservative EPUB styles for reflowable Japanese text.
 * Keep layout relative: reading systems must remain free to change font size,
 * line height and viewport dimensions.
 */
export function defaultEpubStyles(): string {
  return `html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: serif;
  line-height: 1.7;
}

.fileshape-page {
  margin: 0;
  padding: 1em;
}

.fileshape-horizontal {
  writing-mode: horizontal-tb;
}

.fileshape-vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.fileshape-block {
  margin: 0 0 1em 0;
}

.fileshape-image {
  margin: 1em 0;
}

.fileshape-image img {
  max-inline-size: 100%;
  block-size: auto;
}

ruby {
  ruby-position: over;
}

rt {
  font-size: 0.5em;
}

.fileshape-unresolved-notes {
  margin-block-start: 2em;
  padding-block-start: 1em;
  border-block-start: 1px solid currentColor;
}

.fileshape-unresolved-notes > h2 {
  margin: 0 0 0.75em 0;
  font-size: 0.9em;
  font-weight: normal;
}

.fileshape-unresolved-annotation {
  margin: 0.75em 0;
  font-size: 0.85em;
}
`;
}
