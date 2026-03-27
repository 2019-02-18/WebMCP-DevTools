export interface JsonHighlightOptions {
  collapsible?: boolean;
  initialDepth?: number;
}

export function renderJsonHighlight(
  data: unknown,
  options: JsonHighlightOptions = {},
): HTMLElement {
  const { collapsible = true, initialDepth = 2 } = options;
  const container = document.createElement('div');
  container.className = 'json-hl';
  container.appendChild(buildNode(data, 0, collapsible, initialDepth));
  return container;
}

function buildNode(
  value: unknown,
  depth: number,
  collapsible: boolean,
  initialDepth: number,
): DocumentFragment {
  const frag = document.createDocumentFragment();

  if (value === null) {
    frag.appendChild(span('null', 'json-hl__null'));
  } else if (typeof value === 'boolean') {
    frag.appendChild(span(String(value), 'json-hl__bool'));
  } else if (typeof value === 'number') {
    frag.appendChild(span(String(value), 'json-hl__num'));
  } else if (typeof value === 'string') {
    frag.appendChild(span(`"${escapeStr(value)}"`, 'json-hl__str'));
  } else if (Array.isArray(value)) {
    frag.appendChild(
      buildCollection(value, depth, collapsible, initialDepth, true),
    );
  } else if (typeof value === 'object') {
    frag.appendChild(
      buildCollection(
        value as Record<string, unknown>,
        depth,
        collapsible,
        initialDepth,
        false,
      ),
    );
  }

  return frag;
}

function buildCollection(
  data: unknown[] | Record<string, unknown>,
  depth: number,
  collapsible: boolean,
  initialDepth: number,
  isArray: boolean,
): HTMLElement {
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);

  const wrapper = document.createElement('span');
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  if (entries.length === 0) {
    wrapper.appendChild(span(open + close, 'json-hl__bracket'));
    return wrapper;
  }

  const collapsed = collapsible && depth >= initialDepth;

  const toggle = document.createElement('span');
  toggle.className = `json-hl__toggle ${collapsed ? 'json-hl__toggle--collapsed' : ''}`;
  toggle.textContent = collapsed ? '▶' : '▼';

  const openBracket = span(open, 'json-hl__bracket');
  const closeBracket = span(close, 'json-hl__bracket');

  const preview = document.createElement('span');
  preview.className = 'json-hl__preview';
  const count = entries.length;
  preview.textContent = isArray ? `${count} items` : `${count} keys`;
  preview.style.display = collapsed ? 'inline' : 'none';

  const content = document.createElement('div');
  content.className = 'json-hl__content';
  content.style.display = collapsed ? 'none' : 'block';

  entries.forEach(([key, val], idx) => {
    const line = document.createElement('div');
    line.className = 'json-hl__line';

    if (!isArray) {
      line.appendChild(span(`"${escapeStr(key)}"`, 'json-hl__key'));
      line.appendChild(span(': ', 'json-hl__colon'));
    }

    line.appendChild(buildNode(val, depth + 1, collapsible, initialDepth));

    if (idx < entries.length - 1) {
      line.appendChild(span(',', 'json-hl__comma'));
    }

    content.appendChild(line);
  });

  if (collapsible) {
    toggle.addEventListener('click', () => {
      const isCollapsed = toggle.classList.toggle('json-hl__toggle--collapsed');
      content.style.display = isCollapsed ? 'none' : 'block';
      preview.style.display = isCollapsed ? 'inline' : 'none';
    });
    wrapper.appendChild(toggle);
  }

  wrapper.appendChild(openBracket);
  wrapper.appendChild(preview);
  wrapper.appendChild(content);
  wrapper.appendChild(closeBracket);

  return wrapper;
}

function span(text: string, className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function escapeStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
