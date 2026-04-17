const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function esc(str: string): string {
  return str.replace(/[&<>"]/g, (c) => ESCAPE_MAP[c]);
}

export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;

  function closeList() {
    if (listTag) { result.push(`</${listTag}>`); listTag = null; }
  }

  for (const line of lines) {
    if (inCodeBlock) {
      if (line.trimStart().startsWith('```')) {
        result.push(renderCodeBlock(codeLines.join('\n'), codeLang));
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      closeList();
      inCodeBlock = true;
      codeLang = line.trimStart().slice(3).trim();
      continue;
    }

    const trimmed = line.trimStart();

    if (/^#{1,6}\s/.test(trimmed)) {
      closeList();
      const level = trimmed.match(/^(#+)/)?.[1].length ?? 1;
      const hText = trimmed.replace(/^#+\s*/, '');
      result.push(`<h${level} class="md-h">${inlineFormat(hText)}</h${level}>`);
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      if (listTag !== 'ul') { closeList(); result.push('<ul class="md-list">'); listTag = 'ul'; }
      result.push(`<li>${inlineFormat(trimmed.replace(/^[-*]\s/, ''))}</li>`);
      continue;
    }

    if (/^\d+[.)]\s/.test(trimmed)) {
      if (listTag !== 'ol') { closeList(); result.push('<ol class="md-list">'); listTag = 'ol'; }
      result.push(`<li>${inlineFormat(trimmed.replace(/^\d+[.)]\s/, ''))}</li>`);
      continue;
    }

    closeList();

    if (trimmed === '') {
      result.push('<br>');
    } else {
      result.push(`<p class="md-p">${inlineFormat(trimmed)}</p>`);
    }
  }

  if (inCodeBlock) {
    result.push(renderCodeBlock(codeLines.join('\n'), codeLang));
  }
  closeList();

  return result.join('');
}

function inlineFormat(text: string): string {
  let s = esc(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank">$1</a>');
  return s;
}

function renderCodeBlock(code: string, lang: string): string {
  const highlighted = highlightCode(esc(code), lang);
  return `<div class="md-code-block"><div class="md-code-header">${lang || 'code'}</div><pre class="md-code-pre"><code>${highlighted}</code></pre></div>`;
}

function highlightCode(code: string, lang: string): string {
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang)) return highlightJS(code);
  if (['json'].includes(lang)) return highlightJSON(code);
  if (['python', 'py'].includes(lang)) return highlightPython(code);
  if (['html', 'xml', 'svg'].includes(lang)) return highlightHTML(code);
  if (['css', 'scss', 'less'].includes(lang)) return highlightCSS(code);
  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) return highlightBash(code);
  return code;
}

function highlightJS(code: string): string {
  const tokens: Array<{ start: number; end: number; cls: string }> = [];

  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const strings = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;

  for (const m of code.matchAll(comments)) {
    tokens.push({ start: m.index!, end: m.index! + m[0].length, cls: 'md-hl-comment' });
  }
  for (const m of code.matchAll(strings)) {
    if (!tokens.some((t) => m.index! >= t.start && m.index! < t.end)) {
      tokens.push({ start: m.index!, end: m.index! + m[0].length, cls: 'md-hl-string' });
    }
  }

  tokens.sort((a, b) => b.start - a.start);
  let result = code;
  for (const t of tokens) {
    const before = result.slice(0, t.start);
    const content = result.slice(t.start, t.end);
    const after = result.slice(t.end);
    result = before + `<span class="${t.cls}">${content}</span>` + after;
  }

  const keywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|import|export|from|default|class|extends|new|this|super|async|await|try|catch|finally|throw|typeof|instanceof|void|delete|in|of|yield)\b/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const boolNull = /\b(true|false|null|undefined|NaN|Infinity)\b/g;

  result = result.replace(keywords, '<span class="md-hl-keyword">$1</span>');
  result = result.replace(boolNull, '<span class="md-hl-keyword">$1</span>');
  result = result.replace(numbers, '<span class="md-hl-number">$1</span>');
  return result;
}

function highlightJSON(code: string): string {
  return code
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="md-hl-key">$1</span>$2')
    .replace(/:(\s*"(?:[^"\\]|\\.)*")/g, ':<span class="md-hl-string">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="md-hl-number">$1</span>')
    .replace(/:\s*(true|false|null)\b/g, ': <span class="md-hl-keyword">$1</span>');
}

function highlightPython(code: string): string {
  const keywords = /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|yield|lambda|in|not|and|or|is|True|False|None|self|async|await|print|range|len|str|int|float|list|dict|set|tuple|type)\b/g;
  return code.replace(keywords, '<span class="md-hl-keyword">$1</span>');
}

function highlightHTML(code: string): string {
  return code
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="md-hl-keyword">$2</span>')
    .replace(/([\w-]+)(=)/g, '<span class="md-hl-key">$1</span>$2')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="md-hl-string">$1</span>');
}

function highlightCSS(code: string): string {
  return code
    .replace(/([\w-]+)(\s*:)/g, '<span class="md-hl-key">$1</span>$2')
    .replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="md-hl-number">$1</span>')
    .replace(/\b(\d+\.?\d*)(px|em|rem|%|vh|vw|s|ms)\b/g, '<span class="md-hl-number">$1$2</span>');
}

function highlightBash(code: string): string {
  const keywords = /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|function|return|in|export|source|alias|sudo|cd|ls|echo|grep|sed|awk|cat|rm|cp|mv|mkdir|chmod|chown|curl|wget|npm|npx|node|git|docker|pip|python)\b/g;
  return code
    .replace(/(#.*$)/gm, '<span class="md-hl-comment">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="md-hl-string">$1</span>')
    .replace(keywords, '<span class="md-hl-keyword">$1</span>');
}
