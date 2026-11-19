// Card template rendering, compatible with Anki's mustache-like syntax:
//   {{Field}}  {{FrontSide}}  {{#Field}}..{{/Field}}  {{^Field}}..{{/Field}}
//   filters: {{text:F}} {{hint:F}} {{type:F}} {{cloze:F}} {{type:cloze:F}} {{tts en_US:F}}
//   special: {{Tags}} {{Deck}} {{Subdeck}} {{Type}} {{Card}} {{CardFlag}}

export interface RenderContext {
  fields: Record<string, string>;
  tags: string[];
  deck: string;
  notetype: string;
  cardName: string;
  flag: number;
  ord: number; // card ordinal (cloze number - 1 for cloze notes)
  frontSide?: string;
  question: boolean;
  typed?: string; // typed answer (for answer side)
}

type Node =
  | { t: "text"; v: string }
  | { t: "var"; v: string }
  | { t: "sec"; name: string; inverted: boolean; children: Node[] };

export function parseTemplate(tpl: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: "", children: root }];
  const re = /\{\{(.*?)\}\}/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ t: "text", v: tpl.slice(last, m.index) });
    last = re.lastIndex;
    const inner = m[1].trim();
    if (inner.startsWith("#") || inner.startsWith("^")) {
      const sec: Node = { t: "sec", name: inner.slice(1).trim(), inverted: inner[0] === "^", children: [] };
      top.children.push(sec);
      stack.push({ name: sec.name, children: sec.children });
    } else if (inner.startsWith("/")) {
      if (stack.length > 1) stack.pop();
    } else if (inner.startsWith("!")) {
      // comment
    } else {
      top.children.push({ t: "var", v: inner });
    }
  }
  if (last < tpl.length) stack[stack.length - 1].children.push({ t: "text", v: tpl.slice(last) });
  return root;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<(style|script)[^>]*>.*?<\/\1>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldNonEmpty(v: string | undefined): boolean {
  return !!v && stripHtml(v).trim() !== "";
}

// ---------- cloze ----------

const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;

export function clozeNumbers(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(CLOZE_RE)) set.add(parseInt(m[1], 10));
  return [...set].sort((a, b) => a - b);
}

export function renderCloze(text: string, ord: number, question: boolean): string {
  const target = ord + 1;
  return text.replace(CLOZE_RE, (_all, num: string, content: string, hint?: string) => {
    const n = parseInt(num, 10);
    if (n !== target) return content;
    if (question) return `<span class="cloze" data-cloze="${escapeHtml(content)}">[${hint ? escapeHtml(hint) : "..."}]</span>`;
    return `<span class="cloze">${content}</span>`;
  });
}

export function clozeAnswerText(text: string, ord: number): string {
  const target = ord + 1;
  const parts: string[] = [];
  for (const m of text.matchAll(CLOZE_RE)) if (parseInt(m[1], 10) === target) parts.push(stripHtml(m[2]));
  return parts.join(", ");
}

// ---------- type-in answer ----------

export function compareTyped(typed: string, correct: string): string {
  const a = typed.trim();
  const b = correct.trim();
  if (a === b) return `<code id="typeans"><span class="typeGood">${escapeHtml(b)}</span></code>`;
  // LCS-based char diff
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  let given = "", expected = "";
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      given += `<span class="typeGood">${escapeHtml(a[i])}</span>`;
      expected += `<span class="typeGood">${escapeHtml(b[j])}</span>`;
      i++; j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      given += `<span class="typeMissed">-</span>`;
      expected += `<span class="typeMissed">${escapeHtml(b[j])}</span>`;
      j++;
    } else {
      given += `<span class="typeBad">${escapeHtml(a[i])}</span>`;
      i++;
    }
  }
  if (!a) return `<code id="typeans">${expected}</code>`;
  return `<code id="typeans">${given}<br><span id="typearrow">&darr;</span><br>${expected}</code>`;
}

// ---------- rendering ----------

function applyFilters(name: string, ctx: RenderContext): string {
  // TTS: {{tts en_US:Field}} or {{tts en_US voices=..:Field}}
  const ttsM = name.match(/^tts\s+([^\s:]+)[^:]*:(.+)$/);
  if (ttsM) {
    const text = stripHtml(resolveField(ttsM[2].trim(), ctx));
    return `<button class="tts" data-lang="${escapeHtml(ttsM[1])}" data-text="${escapeHtml(text)}" onclick="window.voclaSpeak && window.voclaSpeak(this.dataset.text,this.dataset.lang)">&#9654;</button>`;
  }
  const parts = name.split(":");
  const fieldName = parts.pop()!.trim();
  const filters = parts.map((p) => p.trim());

  // type answer is special (needs knowledge of front/back)
  if (filters[0] === "type") {
    const isCloze = filters[1] === "cloze";
    let correct = resolveField(fieldName, ctx);
    correct = isCloze ? clozeAnswerText(correct, ctx.ord) : stripHtml(correct);
    if (ctx.question) return `<input type="text" id="typeans" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    return compareTyped(ctx.typed ?? "", correct);
  }

  let value = resolveField(fieldName, ctx);
  for (const f of filters.reverse()) {
    if (f === "text") value = stripHtml(value);
    else if (f === "cloze") value = renderCloze(value, ctx.ord, ctx.question);
    else if (f === "cloze-only") value = clozeAnswerText(value, ctx.ord);
    else if (f === "hint") {
      if (!fieldNonEmpty(value)) return "";
      value = `<a class="hint" href="#" onclick="this.style.display='none';this.nextElementSibling.style.display='inline';return false;">Show ${escapeHtml(fieldName)}</a><span class="hint" style="display:none">${value}</span>`;
    } else if (f === "furigana") value = value.replace(/ ?([^ >]+?)\[(.+?)\]/g, "<ruby><rb>$1</rb><rt>$2</rt></ruby>");
    else if (f === "kana") value = value.replace(/ ?([^ >]+?)\[(.+?)\]/g, "$2");
    else if (f === "kanji") value = value.replace(/ ?([^ >]+?)\[(.+?)\]/g, "$1");
  }
  return value;
}

function resolveField(name: string, ctx: RenderContext): string {
  switch (name) {
    case "FrontSide":
      return ctx.frontSide ?? "";
    case "Tags":
      return ctx.tags.join(" ");
    case "Deck":
      return ctx.deck;
    case "Subdeck":
      return ctx.deck.split("::").pop() ?? "";
    case "Type":
      return ctx.notetype;
    case "Card":
      return ctx.cardName;
    case "CardFlag":
      return ctx.flag ? `flag${ctx.flag}` : "";
  }
  if (name in ctx.fields) return ctx.fields[name];
  return `<span class="tmpl-error">{unknown field ${escapeHtml(name)}}</span>`;
}

function renderNodes(nodes: Node[], ctx: RenderContext): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "var") out += applyFilters(n.v, ctx);
    else {
      let present: boolean;
      if (n.name in ctx.fields) present = fieldNonEmpty(ctx.fields[n.name]);
      else present = fieldNonEmpty(resolveFieldSafe(n.name, ctx));
      if (present !== n.inverted) out += renderNodes(n.children, ctx);
    }
  }
  return out;
}

function resolveFieldSafe(name: string, ctx: RenderContext): string {
  if (["Tags", "Deck", "Subdeck", "Type", "Card", "CardFlag", "FrontSide"].includes(name)) return resolveField(name, ctx);
  return "";
}

export function render(tpl: string, ctx: RenderContext): string {
  return renderNodes(parseTemplate(tpl), ctx);
}

/** Whether a template would produce a non-empty front for the given fields (card generation rule). */
export function templateNonEmpty(qfmt: string, fields: Record<string, string>): boolean {
  const used = new Set<string>();
  const walk = (nodes: Node[], fs: Record<string, string>) => {
    for (const n of nodes) {
      if (n.t === "var") {
        const fname = n.v.startsWith("tts ") ? n.v.split(":").pop()!.trim() : n.v.split(":").pop()!.trim();
        used.add(fname);
      } else if (n.t === "sec") {
        const present = fieldNonEmpty(fs[n.name]);
        if (present !== n.inverted) walk(n.children, fs);
      }
    }
  };
  walk(parseTemplate(qfmt), fields);
  for (const f of used) if (f in fields && fieldNonEmpty(fields[f])) return true;
  return false;
}
