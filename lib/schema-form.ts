import { t } from './i18n';

interface SchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
}

export class SchemaForm {
  private root: HTMLElement;
  private schema: SchemaNode;
  private requiredFields: Set<string>;

  constructor(schemaStr: string) {
    this.schema = JSON.parse(schemaStr);
    this.root = document.createElement('div');
    this.root.className = 'sf';
    this.requiredFields = new Set(this.schema.required ?? []);
    this.build();
  }

  getElement(): HTMLElement {
    return this.root;
  }

  validate(): boolean {
    let valid = true;
    this.root.querySelectorAll('.sf__error').forEach((e) => e.remove());
    this.root.querySelectorAll('.sf__input--error, .sf__select--error').forEach((e) => {
      e.classList.remove('sf__input--error', 'sf__select--error');
    });

    if (!this.schema.properties) return true;

    for (const name of this.requiredFields) {
      const group = this.root.querySelector(`:scope > .sf__group[data-field-name="${name}"]`) as HTMLElement | null;
      if (!group) continue;

      const input = group.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null;
      if (!input) continue;

      let isEmpty = false;
      if (input instanceof HTMLSelectElement) {
        isEmpty = !input.value || input.value === '';
      } else if (input.type === 'checkbox') {
        isEmpty = false;
      } else {
        isEmpty = !input.value.trim();
      }

      if (isEmpty) {
        valid = false;
        input.classList.add(input instanceof HTMLSelectElement ? 'sf__select--error' : 'sf__input--error');
        const errorEl = document.createElement('div');
        errorEl.className = 'sf__error';
        errorEl.textContent = t('form.required_error', { field: name });
        group.appendChild(errorEl);
      }
    }

    return valid;
  }

  getValues(): Record<string, unknown> {
    if (this.schema.type !== 'object' || !this.schema.properties) return {};
    return this.collectObjectValues(this.root, this.schema);
  }

  private build() {
    if (this.schema.type === 'object' && this.schema.properties) {
      for (const [name, prop] of Object.entries(this.schema.properties)) {
        this.root.appendChild(this.renderField(name, prop, this.requiredFields.has(name)));
      }
    }
  }

  private renderField(name: string, schema: SchemaNode, isRequired: boolean): HTMLElement {
    const group = document.createElement('div');
    group.className = 'sf__group';
    group.dataset.fieldName = name;

    const label = document.createElement('label');
    label.className = 'sf__label';
    label.textContent = name;
    if (isRequired) {
      const req = document.createElement('span');
      req.className = 'sf__required';
      req.textContent = ' *';
      label.appendChild(req);
    }
    group.appendChild(label);

    if (schema.description) {
      const hint = document.createElement('div');
      hint.className = 'sf__hint';
      hint.textContent = schema.description;
      group.appendChild(hint);
    }

    const resolvedType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    if (schema.enum) {
      group.appendChild(this.createSelect(name, schema));
    } else if (resolvedType === 'boolean') {
      group.appendChild(this.createToggle(name, schema));
    } else if (resolvedType === 'integer' || resolvedType === 'number') {
      group.appendChild(this.createNumberInput(name, schema));
    } else if (resolvedType === 'string') {
      if (schema.format === 'date') {
        group.appendChild(this.createDateInput(name, schema));
      } else {
        group.appendChild(this.createTextInput(name, schema));
      }
    } else if (resolvedType === 'object' && schema.properties) {
      group.appendChild(this.createObjectFields(name, schema));
    } else if (resolvedType === 'array') {
      group.appendChild(this.createArrayField(name, schema));
    } else {
      group.appendChild(this.createTextInput(name, schema));
    }

    return group;
  }

  private createTextInput(name: string, schema: SchemaNode): HTMLElement {
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sf__input';
    input.name = name;
    input.autocomplete = 'off';
    input.placeholder = schema.description ?? '';
    if (schema.default !== undefined) input.value = String(schema.default);
    input.addEventListener('input', () => this.clearFieldError(input));
    wrapper.appendChild(input);
    const constraints = this.formatConstraints(schema);
    if (constraints) {
      const hint = document.createElement('div');
      hint.className = 'sf__constraint';
      hint.textContent = constraints;
      wrapper.appendChild(hint);
    }
    return wrapper;
  }

  private createNumberInput(name: string, schema: SchemaNode): HTMLElement {
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'sf__input';
    input.name = name;
    input.autocomplete = 'off';
    input.placeholder = schema.description ?? '';
    if (schema.default !== undefined) input.value = String(schema.default);
    if ((Array.isArray(schema.type) ? schema.type[0] : schema.type) === 'integer') {
      input.step = '1';
    }
    input.addEventListener('input', () => this.clearFieldError(input));
    wrapper.appendChild(input);
    const constraints = this.formatConstraints(schema);
    if (constraints) {
      const hint = document.createElement('div');
      hint.className = 'sf__constraint';
      hint.textContent = constraints;
      wrapper.appendChild(hint);
    }
    return wrapper;
  }

  private createDateInput(name: string, schema: SchemaNode): HTMLElement {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'sf__input';
    input.name = name;
    input.autocomplete = 'off';
    if (schema.default !== undefined) input.value = String(schema.default);
    input.addEventListener('change', () => this.clearFieldError(input));
    return input;
  }

  private createSelect(name: string, schema: SchemaNode): HTMLElement {
    const select = document.createElement('select');
    select.className = 'sf__select';
    select.name = name;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('form.select_placeholder');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    for (const val of schema.enum!) {
      const opt = document.createElement('option');
      opt.value = String(val);
      opt.textContent = String(val);
      if (schema.default !== undefined && val === schema.default) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }

    select.addEventListener('change', () => this.clearFieldError(select));
    return select;
  }

  private createToggle(name: string, schema: SchemaNode): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'sf__toggle-wrap';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'sf__toggle';
    input.name = name;
    if (schema.default === true) input.checked = true;
    const slider = document.createElement('span');
    slider.className = 'sf__toggle-slider';
    const label = document.createElement('label');
    label.className = 'sf__toggle-label';
    label.appendChild(input);
    label.appendChild(slider);
    wrapper.appendChild(label);
    return wrapper;
  }

  private createObjectFields(name: string, schema: SchemaNode): HTMLElement {
    const block = document.createElement('div');
    block.className = 'sf__object';
    block.dataset.objectName = name;
    const required = new Set(schema.required ?? []);
    for (const [propName, propSchema] of Object.entries(schema.properties!)) {
      block.appendChild(this.renderField(propName, propSchema, required.has(propName)));
    }
    return block;
  }

  private createArrayField(name: string, schema: SchemaNode): HTMLElement {
    const block = document.createElement('div');
    block.className = 'sf__array';
    block.dataset.arrayName = name;
    const items = document.createElement('div');
    items.className = 'sf__array-items';
    block.appendChild(items);
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--sm sf__array-add';
    addBtn.textContent = '+ Add Item';
    addBtn.addEventListener('click', () => {
      const itemSchema = schema.items ?? { type: 'string' };
      items.appendChild(this.createArrayItem(name, itemSchema, items.children.length, items));
    });
    block.appendChild(addBtn);
    return block;
  }

  private createArrayItem(_arrayName: string, itemSchema: SchemaNode, _index: number, container: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sf__array-item';
    const resolvedType = Array.isArray(itemSchema.type) ? itemSchema.type[0] : itemSchema.type;
    if (resolvedType === 'object' && itemSchema.properties) {
      const objectFields = document.createElement('div');
      objectFields.className = 'sf__object';
      const required = new Set(itemSchema.required ?? []);
      for (const [pn, ps] of Object.entries(itemSchema.properties)) {
        objectFields.appendChild(this.renderField(pn, ps, required.has(pn)));
      }
      row.appendChild(objectFields);
    } else {
      const input = document.createElement('input');
      input.type = resolvedType === 'number' || resolvedType === 'integer' ? 'number' : 'text';
      input.className = 'sf__input';
      input.placeholder = itemSchema.description ?? '';
      row.appendChild(input);
    }
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn--sm sf__array-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => container.removeChild(row));
    row.appendChild(removeBtn);
    return row;
  }

  private formatConstraints(schema: SchemaNode): string {
    const parts: string[] = [];
    if (schema.minLength !== undefined) parts.push(`min: ${schema.minLength}`);
    if (schema.maxLength !== undefined) parts.push(`max: ${schema.maxLength}`);
    if (schema.minimum !== undefined) parts.push(`≥ ${schema.minimum}`);
    if (schema.maximum !== undefined) parts.push(`≤ ${schema.maximum}`);
    if (schema.format && schema.format !== 'date') parts.push(`format: ${schema.format}`);
    return parts.length > 0 ? parts.join(' · ') : '';
  }

  private clearFieldError(el: HTMLElement) {
    el.classList.remove('sf__input--error', 'sf__select--error');
    const group = el.closest('.sf__group');
    group?.querySelector('.sf__error')?.remove();
  }

  private collectObjectValues(container: HTMLElement, schema: SchemaNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!schema.properties) return result;
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      const group = container.querySelector(`:scope > .sf__group[data-field-name="${name}"]`) as HTMLElement | null;
      if (!group) continue;
      const resolvedType = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;
      if (propSchema.enum) {
        const select = group.querySelector('select') as HTMLSelectElement | null;
        if (select?.value) result[name] = select.value;
      } else if (resolvedType === 'boolean') {
        const cb = group.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb) result[name] = cb.checked;
      } else if (resolvedType === 'integer') {
        const input = group.querySelector('input[type="number"]') as HTMLInputElement | null;
        if (input?.value) result[name] = parseInt(input.value, 10);
      } else if (resolvedType === 'number') {
        const input = group.querySelector('input[type="number"]') as HTMLInputElement | null;
        if (input?.value) result[name] = parseFloat(input.value);
      } else if (resolvedType === 'object' && propSchema.properties) {
        const obj = group.querySelector('.sf__object') as HTMLElement | null;
        if (obj) {
          const val = this.collectObjectValues(obj, propSchema);
          if (Object.keys(val).length > 0) result[name] = val;
        }
      } else if (resolvedType === 'array') {
        const arr = group.querySelector('.sf__array') as HTMLElement | null;
        if (arr) result[name] = this.collectArrayValues(arr, propSchema);
      } else {
        const input = group.querySelector('input') as HTMLInputElement | null;
        if (input?.value) result[name] = input.value;
      }
    }
    return result;
  }

  private collectArrayValues(container: HTMLElement, schema: SchemaNode): unknown[] {
    const items = container.querySelectorAll(':scope > .sf__array-items > .sf__array-item');
    const result: unknown[] = [];
    const itemSchema = schema.items ?? { type: 'string' };
    const itemType = Array.isArray(itemSchema.type) ? itemSchema.type[0] : itemSchema.type;
    items.forEach((item) => {
      if (itemType === 'object' && itemSchema.properties) {
        const obj = item.querySelector('.sf__object') as HTMLElement | null;
        if (obj) result.push(this.collectObjectValues(obj, itemSchema));
      } else {
        const input = item.querySelector('input') as HTMLInputElement | null;
        if (input?.value) {
          if (itemType === 'number') result.push(parseFloat(input.value));
          else if (itemType === 'integer') result.push(parseInt(input.value, 10));
          else result.push(input.value);
        }
      }
    });
    return result;
  }
}
