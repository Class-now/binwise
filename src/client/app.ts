import { LANGUAGES, LANGUAGE_NAMES, detectLanguage, isLanguage, t, type Key, type Language } from "./i18n";
import { daysFromArea, groupOf, groupsFor, nextCollection, type Days, type Group, type Rule } from "./schedule";

// ---- types mirrored from the worker responses ----

interface CatalogCategory { id: string; name: string; nameJa: string; color: string; icon: string; collection: string; url: string }
interface CatalogItem { id: string; name: string; nameJa: string; aliases: string[]; categories: string[]; prep: string[]; mistake?: string }
interface Catalog {
  ward: string; name: string; nameJa: string; searchUrl: string; readOn: string;
  categories: CatalogCategory[]; items: CatalogItem[];
  areas?: { area: string; days: Record<string, string> }[];
}
interface Card {
  part: { id: string; name: string; nameJa: string };
  category: CatalogCategory;
  fate: string;
}
interface Answer {
  id: string; name: string; nameJa: string; cards: Card[]; prep: string[]; prepOriginal?: string[];
  note?: string; commonMistake?: { text: string; wrongCategory?: string }; source: string; derived: boolean; ruleQuote?: string;
}
interface LookupResult {
  query: string; status: "found" | "weak" | "not_found"; confidence: number; answer?: Answer;
  alternatives: { id: string; name: string; score: number }[]; officialSearchUrl: string;
}
interface Trace { mode: string; steps: { step: string; model?: string; ms: number; detail?: string }[]; matched?: { query: string; itemId: string; score: number }[] }
interface LookupResponse { language: string; requestedLanguage: string; results: LookupResult[]; trace: Trace }

// ---- settings (localStorage only) ----

type WardId = "shibuya" | "shinjuku" | "setagaya";
interface Settings { ward: WardId; language: Language; days: Days; area?: string }
interface Impact { checked: number; avoided: number }

const KEY_SETTINGS = "binwise.settings";
const KEY_RECENT = "binwise.recent";
const KEY_IMPACT = "binwise.impact";
const WARDS: WardId[] = ["shibuya", "shinjuku", "setagaya"];

function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the app still works for this session.
  }
}

function loadSettings(): Settings | undefined {
  const s = load<Settings>(KEY_SETTINGS);
  if (!s || !WARDS.includes(s.ward) || !isLanguage(s.language)) return undefined;
  return { ward: s.ward, language: s.language, days: s.days ?? {}, area: s.area };
}

let settings = loadSettings();
let lang: Language = settings?.language ?? detectLanguage(navigator.languages ?? [navigator.language]);
let catalog: Catalog | undefined;
let groups: Group[] = [];

// ---- DOM helpers ----

// Workers types and the DOM lib share one tsconfig, so element types are cast rather than constrained.
const $ = <T = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? "" : value);
  }
  put(el as unknown as HTMLElement, ...children);
  return el;
}

/** Appends children, skipping empty ones (Element.append is typed for HTMLRewriter here). */
function put(parent: HTMLElement, ...children: Child[]): void {
  for (const c of children) if (c) parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
}

const tr = (key: Key, vars?: Record<string, string | number>) => t(lang, key, vars);

function safeUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function extLink(url: string, text: string): HTMLElement {
  const href = safeUrl(url);
  return href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text) : h("span", {}, text);
}

function show(section: "setup" | "search" | "quiz"): void {
  for (const id of ["setup", "search", "quiz"]) $(id).hidden = id !== section;
  $("open-settings").hidden = section === "setup" || !settings;
}

// ---- static text ----

function applyText(): void {
  document.documentElement.lang = lang;
  const set = (id: string, key: Key) => ($(id).textContent = tr(key));
  set("tagline", "tagline");
  set("setup-title", "setupTitle");
  set("ward-label", "wardLabel");
  set("language-label", "languageLabel");
  set("days-title", "daysTitle");
  set("days-help", "daysHelp");
  set("area-label", "areaLabel");
  set("save-setup", "save");
  set("open-settings", "settings");
  set("query-label", "searchLabel");
  set("search-button", "searchButton");
  set("recent-title", "recent");
  set("quiz-title", "quiz");
  $<HTMLInputElement>("query").placeholder = tr("searchPlaceholder");
  $("snap").replaceChildren(h("span", { class: "icon", "aria-hidden": "true" }, "📷"), tr("snap"), h("small", {}, tr("snapHelp")));
  $("start-quiz").replaceChildren(h("span", { "aria-hidden": "true" }, "🎯 "), `${tr("quiz")} — ${tr("quizHelp")}`);
  $("ward-name").textContent = catalog ? `${catalog.name}${lang === "ja" ? "" : ` · ${catalog.nameJa}`}` : "";
  $("footer").textContent = catalog ? tr("dataNote", { date: catalog.readOn }) : "";
  renderImpact();
  renderRecent();
}

// ---- catalog ----

async function loadCatalog(ward: WardId, language: Language): Promise<Catalog> {
  const res = await fetch(`/api/catalog?ward=${ward}&language=${language}`);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return (await res.json()) as Catalog;
}

async function useCatalog(ward: WardId, language: Language, loaded?: Catalog): Promise<void> {
  catalog = loaded ?? (await loadCatalog(ward, language));
  groups = groupsFor(ward, catalog.categories.map((c) => c.id));
  const list = $("item-names");
  const seen = new Set<string>();
  const options: HTMLOptionElement[] = [];
  for (const item of catalog.items) {
    for (const name of item.aliases) {
      if (seen.has(name)) continue;
      seen.add(name);
      options.push(h("option", { value: name }));
    }
  }
  list.replaceChildren(...options);
}

// ---- setup ----

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function weekdayName(day: number, style: "short" | "long"): string {
  // 2026-11-01 is a Sunday.
  return new Intl.DateTimeFormat(lang, { weekday: style }).format(new Date(2026, 10, 1 + day));
}

function groupLabel(g: Group): string {
  return tr(`g_${g.id}` as Key);
}

function chip(name: string, value: string, label: string, checked: boolean, aria?: string): HTMLElement {
  return h(
    "label",
    { class: "chip" },
    h("input", { type: "checkbox", name, value, checked, "aria-label": aria }),
    h("span", { "aria-hidden": aria ? "true" : undefined }, label),
  );
}

function renderDayGroups(days: Days): void {
  const wrap = $("day-groups");
  wrap.replaceChildren(
    ...groups.map((g) => {
      const rule = days[g.id];
      const legend = groupLabel(g);
      return h(
        "fieldset",
        { "data-group": g.id },
        h("legend", {}, legend),
        h(
          "div",
          { class: "chips" },
          ...WEEKDAY_ORDER.map((d) =>
            chip(`day-${g.id}`, String(d), weekdayName(d, "short"), Boolean(rule?.weekdays.includes(d)), `${legend}: ${weekdayName(d, "long")}`),
          ),
        ),
        g.monthly
          ? h(
              "div",
              {},
              h("div", { class: "sub" }, tr("weeksLabel")),
              h(
                "div",
                { class: "chips" },
                ...[1, 2, 3, 4].map((w) =>
                  chip(`week-${g.id}`, String(w), String(w), Boolean(rule?.weeks?.includes(w)), `${legend}: ${tr("weeksLabel")} ${w}`),
                ),
              ),
            )
          : null,
      );
    }),
  );
}

function readDayGroups(): Days {
  const out: Days = {};
  for (const g of groups) {
    const values = (name: string) =>
      [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => Number(i.value));
    const weekdays = values(`day-${g.id}`);
    if (!weekdays.length) continue;
    const weeks = values(`week-${g.id}`);
    const rule: Rule = { weekdays };
    if (weeks.length) rule.weeks = weeks;
    out[g.id] = rule;
  }
  return out;
}

async function openSetup(): Promise<void> {
  const wardSelect = $<HTMLSelectElement>("ward-select");
  const langSelect = $<HTMLSelectElement>("language-select");
  langSelect.replaceChildren(...LANGUAGES.map((l) => h("option", { value: l, selected: l === lang }, LANGUAGE_NAMES[l])));
  wardSelect.value = settings?.ward ?? "shibuya";
  await refreshSetupWard({ days: settings?.days ?? {}, area: settings?.area });
  show("setup");
}

let setupRefresh = 0;

/**
 * Reloads the catalog for the selected ward and language, then redraws the area list and day chips.
 * `keep` carries the user's current entries across a language change; a ward change starts empty.
 * Only the latest call draws, and entries are read after the fetch so choices made meanwhile survive.
 */
async function refreshSetupWard(keep: "none" | "current" | { days: Days; area?: string }): Promise<void> {
  const token = ++setupRefresh;
  const ward = $<HTMLSelectElement>("ward-select").value as WardId;
  const next = await loadCatalog(ward, lang);
  if (token !== setupRefresh) return;
  const previous = { days: readDayGroups(), area: $<HTMLSelectElement>("area-select").value || undefined };
  const sameWard = catalog?.ward === ward;
  await useCatalog(ward, lang, next);
  const { days, area } = keep === "none" ? { days: {}, area: undefined } : keep === "current" ? (sameWard ? previous : { days: {}, area: undefined }) : keep;
  applyText();
  const areaWrap = $("area-wrap");
  const areaSelect = $<HTMLSelectElement>("area-select");
  if (catalog?.areas?.length) {
    areaWrap.hidden = false;
    areaSelect.replaceChildren(
      h("option", { value: "" }, tr("areaNone")),
      ...catalog.areas.map((a) => h("option", { value: a.area, selected: a.area === area }, a.area)),
    );
  } else {
    areaWrap.hidden = true;
    areaSelect.replaceChildren();
  }
  renderDayGroups(days);
}

function bindSetup(): void {
  $("ward-select").addEventListener("change", () => {
    if ($<HTMLSelectElement>("ward-select").value !== catalog?.ward) void refreshSetupWard("none");
  });
  $("language-select").addEventListener("change", () => {
    const value = $<HTMLSelectElement>("language-select").value;
    if (isLanguage(value)) lang = value;
    void refreshSetupWard("current");
  });
  $("area-select").addEventListener("change", () => {
    const area = $<HTMLSelectElement>("area-select").value;
    const row = catalog?.areas?.find((a) => a.area === area);
    if (row) renderDayGroups(daysFromArea(row.days, groups));
  });
  $("setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ward = $<HTMLSelectElement>("ward-select").value as WardId;
    settings = { ward, language: lang, days: readDayGroups(), area: $<HTMLSelectElement>("area-select").value || undefined };
    store(KEY_SETTINGS, settings);
    $("results").replaceChildren();
    $("status").textContent = "";
    show("search");
    $("query").focus();
  });
  $("open-settings").addEventListener("click", () => void openSetup());
}

// ---- impact and recent ----

function impact(): Impact {
  return load<Impact>(KEY_IMPACT) ?? { checked: 0, avoided: 0 };
}

function renderImpact(): void {
  const i = impact();
  $("impact").textContent = `🌱 ${tr("impact", { checked: i.checked, avoided: i.avoided })}`;
}

function countImpact(results: LookupResult[]): void {
  const i = impact();
  for (const r of results) {
    if (!r.answer) continue;
    i.checked += 1;
    if (r.answer.commonMistake) i.avoided += 1;
  }
  store(KEY_IMPACT, i);
  renderImpact();
}

function recent(): string[] {
  return load<string[]>(KEY_RECENT) ?? [];
}

function remember(query: string): void {
  store(KEY_RECENT, [query, ...recent().filter((q) => q !== query)].slice(0, 8));
  renderRecent();
}

function renderRecent(): void {
  const list = recent();
  $("recent-wrap").hidden = list.length === 0;
  $("recent").replaceChildren(
    ...list.map((q) => {
      const b = h("button", { type: "button", "aria-label": `${tr("recent")}: ${q}` }, `🕘 ${q}`);
      b.addEventListener("click", () => {
        $<HTMLInputElement>("query").value = q;
        void search({ query: q });
      });
      return b;
    }),
  );
}

// ---- lookup ----

function setStatus(text: string): void {
  $("status").textContent = text;
}

function errorText(status: number, body: { error?: string } | undefined): string {
  if (status === 429) return tr("rateLimited");
  if (body?.error === "ai_unavailable") return tr("photoUnavailable");
  return tr("error");
}

async function search(input: { query?: string; identified?: unknown }): Promise<void> {
  if (!settings) return;
  setStatus(tr("searching"));
  $("results").replaceChildren();
  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, ward: settings.ward, language: lang }),
    });
    const body = (await res.json().catch(() => undefined)) as (LookupResponse & { error?: string }) | undefined;
    if (!res.ok || !body?.results) {
      setStatus(errorText(res.status, body));
      return;
    }
    if (input.query) remember(input.query);
    renderResults(body);
    countImpact(body.results);
  } catch {
    setStatus(tr("error"));
  }
}

function relDay(inDays: number): string {
  if (inDays === 0) return tr("today");
  if (inDays === 1) return tr("tomorrow");
  return tr("inDays", { n: inDays });
}

function nextLine(categoryId: string): HTMLElement | null {
  const g = groupOf(groups, categoryId);
  if (!g || !settings) return null;
  const rule = settings.days[g.id];
  if (!rule) return h("p", { class: "muted" }, tr("noDays"));
  const next = nextCollection(rule, new Date());
  if (!next) return null;
  const day = new Intl.DateTimeFormat(lang, { weekday: "long", month: "short", day: "numeric" }).format(next.date);
  return h("p", { class: "next" }, `📅 ${tr("nextCollection", { day, rel: relDay(next.inDays) })}`);
}

function partCard(card: Card): HTMLElement {
  const el = h(
    "article",
    { class: "part-card", "data-category": card.category.id },
    h("div", { class: "part" }, `${card.part.name}${lang === "ja" ? "" : ` · ${card.part.nameJa}`}`),
    h(
      "div",
      { class: "cat" },
      h("span", { class: "icon", "aria-hidden": "true" }, card.category.icon),
      h("span", {}, card.category.name),
      lang === "ja" ? null : h("span", { class: "muted" }, card.category.nameJa),
    ),
    nextLine(card.category.id),
    h("p", { class: "muted" }, `${tr("collection")}: ${card.category.collection}`),
    card.fate ? h("p", {}, h("strong", {}, `${tr("why")}: `), card.fate) : null,
  );
  el.style.setProperty("--cat", card.category.color);
  return el;
}

function prepBox(answer: Answer): HTMLElement | null {
  if (!answer.prep.length) return null;
  const list = h(
    "ul",
    {},
    ...answer.prep.map((step) => h("li", {}, h("label", {}, h("input", { type: "checkbox" }), h("span", {}, step)))),
  );
  return h(
    "section",
    { class: "box" },
    h("h3", {}, `🧽 ${tr("prep")}`),
    list,
    answer.prepOriginal?.length
      ? h("details", {}, h("summary", {}, tr("original")), h("ul", {}, ...answer.prepOriginal.map((s) => h("li", {}, s))))
      : null,
  );
}

function traceBox(trace: Trace): HTMLElement {
  return h(
    "details",
    { class: "box trace-box" },
    h("summary", {}, `🔎 ${tr("decided")}`),
    h("p", { class: "trace" }, `mode: ${trace.mode}`),
    h(
      "ol",
      { class: "trace" },
      ...trace.steps.map((s) =>
        h("li", {}, [s.step, s.model, `${s.ms} ms`, s.detail].filter(Boolean).join(" · ")),
      ),
    ),
    trace.matched?.length
      ? h("p", { class: "trace" }, trace.matched.map((m) => `“${m.query}” → ${m.itemId} (${m.score})`).join("; "))
      : null,
  );
}

function resultBlock(r: LookupResult): HTMLElement {
  const block = h("section", { class: "result", "data-status": r.status });
  if (r.status === "not_found" || !r.answer) {
    put(block, 
      h("p", {}, `❔ ${tr("notFound", { q: r.query })}`),
      h("p", {}, extLink(r.officialSearchUrl, tr("officialSearch"))),
    );
    if (r.alternatives.length) put(block, alternatives(r));
    return block;
  }
  const a = r.answer;
  put(block, 
    h("h2", {}, `${a.name}${lang === "ja" || a.name === a.nameJa ? "" : ` · ${a.nameJa}`}`),
    h("p", { class: "muted" }, tr("confidence", { p: Math.round(r.confidence * 100) })),
  );
  if (r.status === "weak") put(block, alternatives(r));
  put(block, h("div", { class: "cards" }, ...a.cards.map(partCard)));
  const prep = prepBox(a);
  if (prep) put(block, prep);
  if (a.note) put(block, h("p", { class: "box" }, h("strong", {}, `ℹ️ ${tr("note")}: `), a.note));
  if (a.commonMistake) put(block, h("p", { class: "box mistake" }, h("strong", {}, `⚠️ ${tr("mistake")}: `), a.commonMistake.text));
  put(block, 
    h(
      "p",
      { class: "muted" },
      a.derived && a.ruleQuote ? `${tr("derived")} “${a.ruleQuote}” — ` : "",
      extLink(a.source, tr("source")),
    ),
  );
  return block;
}

function alternatives(r: LookupResult): HTMLElement {
  return h(
    "div",
    {},
    h("p", {}, tr("weak")),
    h(
      "div",
      { class: "alts" },
      ...r.alternatives.map((alt) => {
        const b = h("button", { type: "button" }, alt.name);
        b.addEventListener("click", () => {
          $<HTMLInputElement>("query").value = alt.name;
          void search({ query: alt.name });
        });
        return b;
      }),
    ),
  );
}

function renderResults(body: LookupResponse): void {
  const nodes: Node[] = [];
  if (body.trace.mode === "lexical-fallback" && !["en", "ja"].includes(body.requestedLanguage)) {
    nodes.push(h("p", { class: "muted" }, tr("fallback")));
  }
  nodes.push(...body.results.map(resultBlock), traceBox(body.trace));
  $("results").replaceChildren(...nodes);
  const found = body.results.filter((r) => r.answer).map((r) => r.answer!.name);
  setStatus(found.length ? found.join(", ") : "");
}

// ---- photo ----

async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function identify(file: File): Promise<void> {
  if (!settings) return;
  setStatus(tr("identifying"));
  $("results").replaceChildren();
  try {
    const image = await downscale(file);
    const form = new FormData();
    form.append("image", image, "photo.jpg");
    const res = await fetch("/api/identify", { method: "POST", body: form });
    const body = (await res.json().catch(() => undefined)) as { items?: { name_en: string }[]; error?: string } | undefined;
    if (!res.ok || !body?.items?.length) {
      setStatus(errorText(res.status, body));
      return;
    }
    setStatus(tr("identified", { names: body.items.map((i) => i.name_en).join(", ") }));
    await search({ identified: { items: body.items } });
  } catch {
    setStatus(tr("error"));
  }
}

function bindSearch(): void {
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $<HTMLInputElement>("query").value.trim();
    if (q) void search({ query: q });
  });
  $("snap").addEventListener("click", () => $<HTMLInputElement>("photo").click());
  $("photo").addEventListener("change", () => {
    const input = $<HTMLInputElement>("photo");
    const file = input.files?.[0];
    input.value = "";
    if (file) void identify(file);
  });
  $("start-quiz").addEventListener("click", () => startQuiz());
}

// ---- quiz ----

const NOT_QUIZZABLE = new Set(["unlisted", "consult", "contact-office"]);
const QUIZ_LENGTH = 10;

interface Question { item: CatalogItem; answer: string; options: string[] }
let quiz: { questions: Question[]; index: number; score: number } | undefined;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildQuiz(): Question[] {
  if (!catalog) return [];
  const pool = catalog.items.filter((i) => i.categories.length === 1 && !NOT_QUIZZABLE.has(i.categories[0]!));
  const used = [...new Set(pool.map((i) => i.categories[0]!))];
  return shuffle(pool)
    .slice(0, QUIZ_LENGTH)
    .map((item) => {
      const answer = item.categories[0]!;
      const others = shuffle(used.filter((c) => c !== answer)).slice(0, 3);
      return { item, answer, options: shuffle([answer, ...others]) };
    });
}

function category(id: string): CatalogCategory | undefined {
  return catalog?.categories.find((c) => c.id === id);
}

function startQuiz(): void {
  quiz = { questions: buildQuiz(), index: 0, score: 0 };
  show("quiz");
  renderQuestion();
}

function renderQuestion(): void {
  if (!quiz) return;
  const body = $("quiz-body");
  const q = quiz.questions[quiz.index];
  if (!q) return renderScore();
  const feedback = h("div", { class: "feedback-wrap", "aria-live": "polite" });
  const next = h("button", { type: "button", class: "primary", id: "quiz-next", hidden: true },
    quiz.index + 1 === quiz.questions.length ? tr("finish") : tr("next"));
  const buttons = q.options.map((id) => {
    const c = category(id)!;
    const b = h("button", { type: "button", "data-category": id }, h("span", { "aria-hidden": "true" }, c.icon), c.name);
    b.addEventListener("click", () => answerQuestion(q, id, buttons, feedback, next));
    return b;
  });
  next.addEventListener("click", () => {
    quiz!.index += 1;
    renderQuestion();
  });
  body.replaceChildren(
    h("p", {}, tr("question", { n: quiz.index + 1, total: quiz.questions.length })),
    h("p", { class: "quiz-item" }, `${q.item.name}${lang === "ja" || q.item.name === q.item.nameJa ? "" : ` · ${q.item.nameJa}`}`),
    h("div", { class: "quiz-options" }, ...buttons),
    feedback,
    h("div", { class: "actions" }, next, backButton()),
  );
  buttons[0]?.focus();
}

function answerQuestion(q: Question, picked: string, buttons: HTMLButtonElement[], feedback: HTMLElement, next: HTMLElement): void {
  if (!quiz) return;
  const right = picked === q.answer;
  if (right) quiz.score += 1;
  for (const b of buttons) {
    b.disabled = true;
    const id = b.dataset.category;
    if (id === q.answer) b.classList.add("right");
    else if (id === picked) b.classList.add("picked-wrong");
  }
  const cat = category(q.answer)!;
  feedback.replaceChildren();
  put(
    feedback,
    h("p", { class: right ? "feedback ok" : "feedback bad" }, right ? `✓ ${tr("correct")}` : `✗ ${tr("wrong", { cat: `${cat.icon} ${cat.name}` })}`),
    q.item.prep.length ? h("p", {}, h("strong", {}, `${tr("prep")}: `), q.item.prep.join(" ")) : null,
    q.item.mistake ? h("p", {}, h("strong", {}, `${tr("mistake")}: `), q.item.mistake) : null,
  );
  next.hidden = false;
  next.focus();
}

function backButton(): HTMLElement {
  const b = h("button", { type: "button" }, tr("back"));
  b.addEventListener("click", () => show("search"));
  return b;
}

function renderScore(): void {
  if (!quiz) return;
  const again = h("button", { type: "button", class: "primary" }, tr("again"));
  again.addEventListener("click", () => startQuiz());
  $("quiz-body").replaceChildren(
    h("p", { class: "quiz-item", id: "quiz-score", role: "status" }, `🏁 ${tr("score", { n: quiz.score, total: quiz.questions.length })}`),
    h("div", { class: "actions" }, again, backButton()),
  );
  again.focus();
}

// ---- start ----

async function start(): Promise<void> {
  bindSetup();
  bindSearch();
  applyText();
  if (!settings) {
    await openSetup();
    return;
  }
  try {
    await useCatalog(settings.ward, lang);
  } catch {
    setStatus(tr("error"));
  }
  applyText();
  show("search");
}

void start();

export {};
