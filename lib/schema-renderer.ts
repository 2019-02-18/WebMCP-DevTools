import { t } from './i18n';

interface SchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  readOnly?: boolean;
}

type SchemaNode = SchemaProperty;

export function renderSchemaTree(schemaStr: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'schema-tree';

  let schema: SchemaNode;
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    container.textContent = t('tools.empty_title');
    return container;
  }

  if (schema.type === 'object' && schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const [name, prop] of Object.entries(schema.properties)) {
      container.appendChild(
        renderProperty(name, prop, required.has(name), 0),
      );
    }
  } else {
    container.appendChild(renderTypeNode(schema, 0));
  }

  return container;
}

function renderProperty(
  name: string,
  schema: SchemaNode,
  isRequired: boolean,
  depth: number,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'schema-prop';
  row.style.paddingLeft = `${depth * 16}px`;

  const header = document.createElement('div');
  header.className = 'schema-prop__header';

  const nameEl = document.createElement('span');
  nameEl.className = 'schema-prop__name';
  nameEl.textContent = name;
  header.appendChild(nameEl);

  if (isRequired) {
    const reqBadge = document.createElement('span');
    reqBadge.className = 'schema-prop__required';
    reqBadge.textContent = '*';
    reqBadge.title = 'required';
    header.appendChild(reqBadge);
  }

  const typeStr = resolveTypeLabel(schema);
  const typeEl = document.createElement('span');
  typeEl.className = `schema-prop__type schema-prop__type--${baseType(schema)}`;
  typeEl.textContent = typeStr;
  header.appendChild(typeEl);

  if (schema.format) {
    const fmtEl = document.createElement('span');
    fmtEl.className = 'schema-prop__format';
    fmtEl.textContent = schema.format;
    header.appendChild(fmtEl);
  }

  if (schema.readOnly) {
    const roEl = document.createElement('span');
    roEl.className = 'schema-prop__readonly';
    roEl.textContent = 'readonly';
    header.appendChild(roEl);
  }

  row.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'schema-prop__meta';
  meta.style.paddingLeft = `${depth * 16}px`;

  if (schema.description) {
    const desc = document.createElement('div');
    desc.className = 'schema-prop__desc';
    desc.textContent = schema.description;
    meta.appendChild(desc);
  }

  if (schema.enum) {
    const enumEl = document.createElement('div');
    enumEl.className = 'schema-prop__enum';
    enumEl.textContent = `enum: ${schema.enum.map((v) => JSON.stringify(v)).join(' | ')}`;
    meta.appendChild(enumEl);
  }

  if (schema.default !== undefined) {
    const defEl = document.createElement('div');
    defEl.className = 'schema-prop__default';
    defEl.textContent = `default: ${JSON.stringify(schema.default)}`;
    meta.appendChild(defEl);
  }

  const constraints = buildConstraints(schema);
  if (constraints) {
    const cEl = document.createElement('div');
    cEl.className = 'schema-prop__constraints';
    cEl.textContent = constraints;
    meta.appendChild(cEl);
  }

  if (meta.childElementCount > 0) {
    row.appendChild(meta);
  }

  if (schema.type === 'object' && schema.properties) {
    const nested = renderNestedObject(schema, depth, name);
    row.appendChild(nested);
  }

  if (schema.type === 'array' && schema.items) {
    const nested = renderNestedArray(schema, depth, name);
    row.appendChild(nested);
  }

  return row;
}

function renderNestedObject(
  schema: SchemaNode,
  depth: number,
  _parentName: string,
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'schema-nested';

  const toggle = document.createElement('button');
  toggle.className = 'schema-nested__toggle';
  toggle.textContent = '▼';
  toggle.addEventListener('click', () => {
    const isCollapsed = inner.style.display === 'none';
    inner.style.display = isCollapsed ? 'block' : 'none';
    toggle.textContent = isCollapsed ? '▼' : '▶';
  });

  const inner = document.createElement('div');
  inner.className = 'schema-nested__content';

  const required = new Set(schema.required ?? []);
  for (const [name, prop] of Object.entries(schema.properties!)) {
    inner.appendChild(renderProperty(name, prop, required.has(name), depth + 1));
  }

  block.appendChild(toggle);
  block.appendChild(inner);
  return block;
}

function renderNestedArray(
  schema: SchemaNode,
  depth: number,
  _parentName: string,
): HTMLElement {
  const block = document.createElement('div');
  block.className = 'schema-nested';

  const items = schema.items!;
  if (items.type === 'object' && items.properties) {
    const toggle = document.createElement('button');
    toggle.className = 'schema-nested__toggle';
    toggle.textContent = '▼';

    const inner = document.createElement('div');
    inner.className = 'schema-nested__content';

    const label = document.createElement('div');
    label.className = 'schema-prop__desc';
    label.style.paddingLeft = `${(depth + 1) * 16}px`;
    label.textContent = `items: object`;
    inner.appendChild(label);

    const required = new Set(items.required ?? []);
    for (const [name, prop] of Object.entries(items.properties)) {
      inner.appendChild(
        renderProperty(name, prop, required.has(name), depth + 2),
      );
    }

    toggle.addEventListener('click', () => {
      const isCollapsed = inner.style.display === 'none';
      inner.style.display = isCollapsed ? 'block' : 'none';
      toggle.textContent = isCollapsed ? '▼' : '▶';
    });

    block.appendChild(toggle);
    block.appendChild(inner);
  } else {
    const itemLabel = document.createElement('div');
    itemLabel.className = 'schema-prop__desc';
    itemLabel.style.paddingLeft = `${(depth + 1) * 16}px`;
    itemLabel.textContent = `items: ${resolveTypeLabel(items)}`;
    block.appendChild(itemLabel);
  }

  return block;
}

function renderTypeNode(schema: SchemaNode, depth: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'schema-prop';
  el.style.paddingLeft = `${depth * 16}px`;

  const typeEl = document.createElement('span');
  typeEl.className = 'schema-prop__type';
  typeEl.textContent = resolveTypeLabel(schema);
  el.appendChild(typeEl);

  if (schema.description) {
    const desc = document.createElement('div');
    desc.className = 'schema-prop__desc';
    desc.textContent = schema.description;
    el.appendChild(desc);
  }

  return el;
}

function resolveTypeLabel(schema: SchemaNode): string {
  if (Array.isArray(schema.type)) {
    return schema.type.join(' | ');
  }
  if (schema.type === 'array' && schema.items) {
    return `${resolveTypeLabel(schema.items)}[]`;
  }
  return schema.type ?? 'any';
}

function baseType(schema: SchemaNode): string {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  return t ?? 'any';
}

function buildConstraints(schema: SchemaNode): string | null {
  const parts: string[] = [];
  if (schema.minimum !== undefined) parts.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) parts.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined) parts.push(`minLen: ${schema.minLength}`);
  if (schema.maxLength !== undefined) parts.push(`maxLen: ${schema.maxLength}`);
  if (schema.pattern) parts.push(`pattern: ${schema.pattern}`);
  return parts.length > 0 ? parts.join(', ') : null;
}
