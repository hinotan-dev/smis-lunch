import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";

/* 内置数据：data/ 里的月份由 scripts/gen-seed.mjs 自动收集，加月份不用改这里 */
import { SEED, SEED_VERSION } from "./seed.generated.js";

/* ---------------------------------------------------------------- 主题 */
const C = {
  paper: "#FFF7E6",
  card: "#FFFFFF",
  band: "#FFC629",
  gold: "#F2A900",
  goldSoft: "#FFF0C2",
  ink: "#3A2A12",
  sub: "#8C7550",
  line: "#F0DEB6",
  warn: "#C43F14",
  warnBg: "#FFE7D8",
  veg: "#5F7F32",
  vegBg: "#EFF4E4",
};

const DISPLAY = "'Fraunces', 'Iowan Old Style', Georgia, serif";
const BODY =
  "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans SC', sans-serif";

const KIND_LABEL = {
  main: "主菜",
  veg: "素食",
  carb: "主食",
  side: "配菜",
  salad: "沙拉",
  drink: "饮料",
  dessert: "甜点",
};

/* 按菜名内容挑 emoji：甜点单独一套规则，避免「Carrot Cake」被读成胡萝卜 */
const DESSERT_RULES = [
  [/chocolate.*(cake|brownie)|brownie/i, "\u{1F36B}"],
  [/cake/i, "\u{1F370}"],
  [/crumble|pie|tart/i, "\u{1F967}"],
  [/jelly|panna cotta|mousse|bavarian|annin|pudding|custard|tapioca/i, "\u{1F36E}"],
  [/chocolate/i, "\u{1F36B}"],
  [/mixed fruit/i, "\u{1F353}"],
  [/watermelon/i, "\u{1F349}"],
  [/pineapple/i, "\u{1F34D}"],
  [/apple/i, "\u{1F34E}"],
  [/peach|pear/i, "\u{1F351}"],
  [/banana/i, "\u{1F34C}"],
  [/mikan|orange/i, "\u{1F34A}"],
  [/grape/i, "\u{1F347}"],
  [/melon/i, "\u{1F348}"],
  [/fruit/i, "\u{1F353}"],
];

const RULES = [
  [/half rice/i, "\u{1F35A}"],
  [/salad|tabbouleh/i, "\u{1F957}"],
  [/pizza/i, "\u{1F355}"],
  [/burger|hamburg/i, "\u{1F354}"],
  [/taco|tortilla|fajita/i, "\u{1F32E}"],
  [/curry|makhani/i, "\u{1F35B}"],
  [/gyoza|shumai|dumpling|spring roll/i, "\u{1F95F}"],
  [/lasagna|pasta|penne|spaghetti|tetrazzini|noodle|yakisoba|boscaiola|arrabbiata|macaroni|mac n cheese/i, "\u{1F35D}"],
  [/sushi|onigiri/i, "\u{1F359}"],
  [/rice|cous ?cous/i, "\u{1F35A}"],
  [/focaccia|ciabatta|bread|roll|bun|breadstick|baguette/i, "\u{1F956}"],
  [/fries|wedges|hash brown/i, "\u{1F35F}"],
  [/croquette|korokke/i, "\u{1F954}"],
  [/potato/i, "\u{1F954}"],
  [/whitefish|fish|tuna|salmon|cod/i, "\u{1F41F}"],
  [/shrimp|prawn|shellfish/i, "\u{1F364}"],
  [/chicken|teriyaki|soboro|tandoori/i, "\u{1F357}"],
  [/beef|steak|pastrami|hayashi|meatball|meat lover|bolognese|salisbury/i, "\u{1F969}"],
  [/bacon|ham\b/i, "\u{1F953}"],
  [/pork|butadon|shogayaki/i, "\u{1F356}"],
  [/tofu|aburaage|atsuage|soy meat|chick ?pea|garbanzo|bean|legume|lentil|edamame|\bpeas?\b/i, "\u{1FAD8}"],
  [/\begg\b|eggs\b|omelet|scramble/i, "\u{1F95A}"],
  [/broccoli|cauliflower/i, "\u{1F966}"],
  [/carrot/i, "\u{1F955}"],
  [/corn/i, "\u{1F33D}"],
  [/spinach|greens|okra|asparagus|cabbage/i, "\u{1F96C}"],
  [/pumpkin|squash|jack o.?lantern/i, "\u{1F383}"],
  [/zucchini|eggplant/i, "\u{1F346}"],
  [/mushroom/i, "\u{1F344}"],
  [/tomato|ratatouille|salsa/i, "\u{1F345}"],
  [/stew|casserole|soup|simmered|loaf/i, "\u{1F372}"],
  [/vegetable|veggie/i, "\u{1F96C}"],
  [/drink|juice|milk/i, "\u{1F964}"],
];

const KIND_EMOJI = {
  main: "\u{1F37D}\uFE0F",
  veg: "\u{1F331}",
  carb: "\u{1F35A}",
  side: "\u{1F955}",
  salad: "\u{1F957}",
  drink: "\u{1F964}",
  dessert: "\u{1F370}",
};

function emojiFor(item) {
  const t = item.en || "";
  const list = item.kind === "dessert" ? DESSERT_RULES : RULES;
  for (const [re, e] of list) if (re.test(t)) return e;
  return KIND_EMOJI[item.kind] || KIND_EMOJI.main;
}

const ALLERGEN_ZH = {
  EGG: "蛋",
  DAIRY: "奶",
  WHEAT: "小麦",
  SESAME: "芝麻",
  SOY: "大豆",
  FISH: "鱼",
  SHELLFISH: "甲壳类",
  "SHELL FISH": "甲壳类",
  PEANUT: "花生",
  NUT: "坚果",
};

const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/* ------------------------------------------------------------ 存储适配 */
const store = {
  async get(k) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(k);
        return r ? r.value : null;
      }
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        await window.storage.set(k, v);
        return true;
      }
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
};
const K_MONTHS = "smis-lunch:months";
const K_NOTES = "smis-lunch:notes";
const K_PREFS = "smis-lunch:prefs";

/* -------------------------------------------------------------- 工具 */
const iso = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const mondayOf = (s) => {
  const d = parse(s);
  const off = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - off);
  return iso(d);
};
const monthOf = (s) => s.slice(0, 7);
const fmtDay = (s) => {
  const d = parse(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
const fmtMonth = (m) => `${m.slice(0, 4)}.${Number(m.slice(5, 7))}`;

/** 主食判定：有整份 White Rice 才算够；只有 Half Rice 或完全没有白饭 → 需要自备 */
function stapleStatus(day) {
  if (!day || day.type !== "menu") return null;
  if (day.staple === "ok") return { ok: true };
  if (day.staple === "warn") return { ok: false, reason: "手动标记" };
  const txt = (day.items || []).map((i) => i.en || "").join(" | ");
  const half = /half\s+rice/i.test(txt);
  const white = /white\s+rice/i.test(txt);
  if (white && !half) return { ok: true };
  if (half) return { ok: false, reason: "只有半份白饭" };
  return { ok: false, reason: "当天没有白饭" };
}

function mergeMonths(seed, local) {
  const map = {};
  local.forEach((m) => m && m.month && (map[m.month] = { ...m, _src: "local" }));
  seed.forEach((m) => m && m.month && (map[m.month] = { ...m, _src: "seed" }));
  return map;
}

/* ------------------------------------------------------------- 组件 */
function Chip({ children, bg, fg, border, size = 11 }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 999,
        background: bg,
        color: fg,
        border: border ? `1px solid ${border}` : "none",
        fontSize: size,
        lineHeight: 1.6,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function WarnRibbon({ reason }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: C.warnBg,
        color: C.warn,
        borderRadius: 10,
        padding: "7px 10px",
        fontSize: 12.5,
        fontWeight: 700,
        marginBottom: 10,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.6 22 20H2L12 3.6Z"
          stroke={C.warn}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 10v4" stroke={C.warn} strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.1" fill={C.warn} />
      </svg>
      需要自备主食 · {reason}
    </div>
  );
}

function Row({ item, showZh, label, icon, big }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <span
        title={label}
        aria-label={label}
        role="img"
        style={{
          fontSize: big ? 20 : 17,
          lineHeight: 1.15,
          width: 26,
          flexShrink: 0,
          textAlign: "center",
          paddingTop: big ? 1 : 2,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: big ? 18 : 15,
            fontWeight: big ? 700 : 600,
            color: C.ink,
            lineHeight: 1.28,
            letterSpacing: -0.1,
          }}
        >
          {item.en}
        </div>
        {showZh && (
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1, lineHeight: 1.35 }}>
            {item.zh}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteBox({ date, value, onChange }) {
  const [v, setV] = useState(value || "");
  const t = useRef(null);
  useEffect(() => setV(value || ""), [date, value]);
  const push = (nv) => {
    setV(nv);
    clearTimeout(t.current);
    t.current = setTimeout(() => onChange(date, nv), 400);
  };
  return (
    <div style={{ marginTop: 12, borderTop: `1px dashed ${C.line}`, paddingTop: 10 }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: C.sub,
          fontWeight: 700,
          marginBottom: 5,
        }}
      >
        备注
      </div>
      <textarea
        value={v}
        onChange={(e) => push(e.target.value)}
        onBlur={() => onChange(date, v)}
        placeholder="今天带了什么 / 孩子的反馈…"
        rows={2}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          background: "#FFFDF6",
          padding: "9px 10px",
          fontSize: 16,          /* iOS 上小于 16px 会在聚焦时自动放大且不会退回 */
          lineHeight: 1.45,
          fontFamily: BODY,
          color: C.ink,
          resize: "vertical",
          outline: "none",
        }}
      />
    </div>
  );
}

const DayCard = React.memo(function DayCard({ date, day, note, onNote, showZh, showVeg, isToday }) {
  const d = parse(date);
  const st = stapleStatus(day);
  const items = (day?.items || []).filter((i) => i.kind !== "drink");
  const main = items.find((i) => i.kind === "main");
  const veg = showVeg ? items.find((i) => i.kind === "veg") : null;
  const rest = items.filter((i) => i.kind !== "main" && i.kind !== "veg");

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${isToday ? C.gold : C.line}`,
        boxShadow: isToday ? `0 0 0 3px ${C.goldSoft}` : "0 1px 2px rgba(90,64,20,.05)",
        borderRadius: 16,
        padding: 14,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 30,
            fontWeight: 700,
            color: C.ink,
            lineHeight: 1,
          }}
        >
          {d.getMonth() + 1}.{d.getDate()}
        </span>
        <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{WD[d.getDay()]}</span>
        <span style={{ flex: 1 }} />
        {isToday && <Chip bg={C.gold} fg="#fff">今天</Chip>}
        {day?.event && (
          <Chip bg={C.goldSoft} fg={C.ink} border={C.gold}>
            {day.eventZh || day.event}
          </Chip>
        )}
      </div>

      {!day && (
        <div style={{ color: C.sub, fontSize: 13.5, padding: "18px 0" }}>暂无菜单数据</div>
      )}

      {day?.type === "closed" && (
        <div
          style={{
            color: C.sub,
            fontSize: 15,
            fontWeight: 600,
            padding: "22px 0",
            textAlign: "center",
          }}
        >
          {day.labelZh || day.label}
        </div>
      )}

      {day?.type === "menu" && (
        <>
          {st && !st.ok && <WarnRibbon reason={st.reason} />}
          {main && <Row item={main} showZh={showZh} label={KIND_LABEL.main} icon={emojiFor(main)} big />}
          {veg && <Row item={veg} showZh={showZh} label={KIND_LABEL.veg} icon={KIND_EMOJI.veg} />}
          {rest.map((it, i) => (
            <Row
              key={i}
              item={it}
              showZh={showZh}
              label={KIND_LABEL[it.kind] || ""}
              icon={emojiFor(it)}
            />
          ))}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              alignItems: "center",
              marginTop: 10,
              paddingTop: 9,
              borderTop: `1px solid ${C.line}`,
            }}
          >
            {(day.allergens || []).map((a) => (
              <Chip key={a} bg="#FBF3E2" fg={C.sub} size={10}>
                {a}
                {showZh && ALLERGEN_ZH[a] ? ` ${ALLERGEN_ZH[a]}` : ""}
              </Chip>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: C.sub }}>
              {day.kcal}kcal · 蛋白 {day.protein}g
            </span>
          </div>
        </>
      )}

      <NoteBox date={date} value={note} onChange={onNote} />
    </div>
  );
});

/* --------------------------------------------------------- 月视图 */
function MonthView({ months, month, setMonth, dayMap, notes, onPick, today }) {
  const keys = Object.keys(months).sort();
  const idx = keys.indexOf(month);
  const first = parse(month + "-01");
  const start = mondayOf(iso(first));
  const cells = [];
  const endM = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  let cur = start;
  while (parse(cur) <= endM) {
    const row = [0, 1, 2, 3, 4].map((i) => addDays(cur, i));
    /* 月初落在周末时，头一行整排都是上个月，跳过 */
    if (cells.length || row.some((d) => monthOf(d) === month)) cells.push(...row);
    cur = addDays(cur, 7);
  }
  const warnDays = cells.filter((d) => {
    const st = stapleStatus(dayMap[d]);
    return monthOf(d) === month && st && !st.ok;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
        <NavBtn disabled={idx <= 0} onClick={() => setMonth(keys[idx - 1])}>‹</NavBtn>
        <div style={{ flex: 1, textAlign: "center", fontFamily: DISPLAY, fontSize: 20, fontWeight: 700 }}>
          {fmtMonth(month)}
        </div>
        <NavBtn disabled={idx >= keys.length - 1} onClick={() => setMonth(keys[idx + 1])}>›</NavBtn>
      </div>

      <div
        style={{
          background: C.warnBg,
          color: C.warn,
          borderRadius: 10,
          padding: "8px 11px",
          fontSize: 12.5,
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        本月 {warnDays.length} 天需要自备主食
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
        {["一", "二", "三", "四", "五"].map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 11, color: C.sub, fontWeight: 700, paddingBottom: 4 }}>
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const day = dayMap[d];
          const inM = monthOf(d) === month;
          const st = stapleStatus(day);
          const hasNote = !!(notes[d] || "").trim();
          const main = day?.items?.find((i) => i.kind === "main");
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              style={{
                height: 80,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                justifyContent: "flex-start",
                textAlign: "left",
                background: inM ? (day?.type === "closed" ? "#FBF5E6" : C.card) : "transparent",
                border: `1px solid ${d === today ? C.gold : C.line}`,
                borderRadius: 10,
                padding: 5,
                overflow: "hidden",
                opacity: inM ? 1 : 0.35,
                cursor: "pointer",
                fontFamily: BODY,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: C.ink }}>
                  {parse(d).getDate()}
                </span>
                {st && !st.ok && <span style={{ color: C.warn, fontSize: 11 }}>▲</span>}
                <span style={{ flex: 1 }} />
                {hasNote && (
                  <span
                    style={{ width: 5, height: 5, borderRadius: 5, background: C.gold, display: "inline-block" }}
                  />
                )}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: day?.type === "closed" ? 400 : 600,
                  color: day?.type === "closed" ? C.sub : C.ink,
                  lineHeight: 1.28,
                  marginTop: 2,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {day?.type === "closed" ? day.labelZh || day.label : main?.zh || ""}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: C.sub, display: "flex", gap: 12 }}>
        <span><span style={{ color: C.warn }}>▲</span> 自备主食</span>
        <span><span style={{ color: C.gold }}>●</span> 有备注</span>
      </div>
    </div>
  );
}

function NavBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: `1px solid ${C.line}`,
        background: C.card,
        color: disabled ? C.line : C.ink,
        fontSize: 17,
        cursor: disabled ? "default" : "pointer",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------- 设置 */
function Settings({ months, localMonths, setLocalMonths, notes, setNotes, prefs, setPrefs, onClose }) {
  const [tab, setTab] = useState("data");
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const addJSON = (text) => {
    try {
      const obj = JSON.parse(text);
      const arr = Array.isArray(obj) ? obj : [obj];
      const bad = arr.find((m) => !m.month || !Array.isArray(m.days));
      if (bad) throw new Error("缺少 month 或 days 字段");
      const next = [...localMonths.filter((m) => !arr.some((a) => a.month === m.month)), ...arr];
      setLocalMonths(next);
      setPaste("");
      setMsg({ ok: true, t: `已添加 ${arr.map((m) => m.month).join("、")}` });
    } catch (e) {
      setMsg({ ok: false, t: `读不到有效数据：${e.message}` });
    }
  };

  const download = (name, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tabBtn = (k, label) => (
    <button
      onClick={() => { setTab(k); setMsg(null); }}
      style={{
        flex: 1,
        padding: "9px 0",
        border: "none",
        background: tab === k ? C.band : "transparent",
        color: C.ink,
        fontWeight: 700,
        fontSize: 13,
        borderRadius: 9,
        cursor: "pointer",
        fontFamily: BODY,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="sheet-wrap"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(58,42,18,.45)",
        display: "flex",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paper,
          width: "100%",
          maxWidth: 560,
          overflowY: "auto",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, flex: 1 }}>设置</div>
          <button
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: C.sub }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 4, background: C.card, padding: 4, borderRadius: 12, marginBottom: 14 }}>
          {tabBtn("data", "菜单数据")}
          {tabBtn("notes", "备注")}
          {tabBtn("pref", "显示")}
        </div>

        {msg && (
          <div
            style={{
              background: msg.ok ? C.vegBg : C.warnBg,
              color: msg.ok ? C.veg : C.warn,
              padding: "8px 11px",
              borderRadius: 9,
              fontSize: 12.5,
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            {msg.t}
          </div>
        )}

        {tab === "data" && (
          <div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>已加载的月份</div>
            {Object.keys(months).sort().map((m) => (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.card,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "9px 11px",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtMonth(m)}</span>
                <Chip bg={months[m]._src === "seed" ? C.goldSoft : C.vegBg} fg={months[m]._src === "seed" ? C.ink : C.veg} size={10}>
                  {months[m]._src === "seed" ? "内置" : "本地添加"}
                </Chip>
                <span style={{ flex: 1, fontSize: 11, color: C.sub }}>
                  {months[m].days.filter((d) => d.type === "menu").length} 天菜单
                </span>
                {months[m]._src === "local" && (
                  <button
                    onClick={() => setLocalMonths(localMonths.filter((x) => x.month !== m))}
                    style={{ border: "none", background: "none", color: C.warn, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                  >
                    删除
                  </button>
                )}
              </div>
            ))}

            <div style={{ fontSize: 12, color: C.sub, margin: "16px 0 6px" }}>
              添加新月份（粘贴 Claude 生成的 JSON，或选文件）
            </div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder='{"month":"2026-10","days":[…]}'
              rows={5}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: 10,
                fontSize: 16,          /* 同上，避免 iOS 聚焦放大 */
                lineHeight: 1.4,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: C.card,
                color: C.ink,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <Btn onClick={() => paste.trim() && addJSON(paste)}>添加到本地</Btn>
              <Btn ghost onClick={() => fileRef.current?.click()}>选择 JSON 文件</Btn>
              <Btn
                ghost
                onClick={() =>
                  download("smis-lunch-data.json", Object.values(months).map(({ _src, ...m }) => m))
                }
              >
                导出全部数据
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => addJSON(String(r.result));
                  r.readAsText(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 10, lineHeight: 1.6 }}>
              内置月份来自网站代码本身，本地添加的月份只存在这台设备上。同一个月两边都有时，以内置版本为准（更新全站后可以把本地那份删掉）。
            </div>
          </div>
        )}

        {tab === "notes" && (
          <div>
            <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10, lineHeight: 1.6 }}>
              备注保存在这台设备的浏览器里。换设备或清缓存前先导出。
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              已记录 {Object.values(notes).filter((v) => (v || "").trim()).length} 条
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={() => download("smis-lunch-notes.json", notes)}>导出备注</Btn>
              <Btn ghost onClick={() => fileRef.current?.click()}>导入备注</Btn>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    try {
                      const o = JSON.parse(String(r.result));
                      setNotes({ ...notes, ...o });
                      setMsg({ ok: true, t: "备注已合并导入" });
                    } catch {
                      setMsg({ ok: false, t: "文件不是有效的备注 JSON" });
                    }
                  };
                  r.readAsText(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {tab === "pref" && (
          <div>
            <Toggle
              label="显示中文菜名"
              on={prefs.showZh}
              onClick={() => setPrefs({ ...prefs, showZh: !prefs.showZh })}
            />
            <div style={{ height: 8 }} />
            <Toggle
              label="显示素食替代菜"
              on={prefs.showVeg}
              onClick={() => setPrefs({ ...prefs, showVeg: !prefs.showVeg })}
            />
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6, lineHeight: 1.6 }}>
              菜单第二行的 (V) 是给素食者替换主菜用的，默认不显示。
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 16, lineHeight: 1.7 }}>
              <b style={{ color: C.ink }}>自备主食的判定</b>
              <br />
              当天菜单里有完整的 White Rice → 不提醒；只有 Half Rice、或者根本没有米饭（披萨、意面、汉堡日）→ 标 ▲。
              想手动改某一天，在该月 JSON 里给这天加 <code>"staple":"ok"</code> 或 <code>"staple":"warn"</code>。
              <br />
              <br />
              菜单每天都含饮料，界面里省略了。甜点在 Buffet Basic Plan 里是可选的。
              <br />
              <br />
              数据版本 SEED {SEED_VERSION} · 来源 Cezars Kitchen 月度 PDF
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Btn({ children, onClick, ghost }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: 10,
        border: ghost ? `1px solid ${C.gold}` : "none",
        background: ghost ? "transparent" : C.gold,
        color: ghost ? C.ink : "#fff",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: BODY,
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: "12px 13px",
        cursor: "pointer",
        fontFamily: BODY,
      }}
    >
      <span style={{ flex: 1, textAlign: "left", fontSize: 14, color: C.ink, fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          background: on ? C.gold : "#E6DCC4",
          position: "relative",
          transition: "background .15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 20 : 2,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "#fff",
            transition: "left .15s",
          }}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------- App */
function App() {
  const [localMonths, setLocalMonths] = useState([]);
  const [notes, setNotes] = useState({});
  const [prefs, setPrefs] = useState({ showZh: true, showVeg: false });
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("week");
  const [showSet, setShowSet] = useState(false);

  const months = useMemo(() => mergeMonths(SEED, localMonths), [localMonths]);
  const dayMap = useMemo(() => {
    const m = {};
    Object.values(months).forEach((mo) => mo.days.forEach((d) => (m[d.date] = d)));
    return m;
  }, [months]);

  const today = iso(new Date());
  const keys = Object.keys(months).sort();
  const dates = Object.keys(dayMap).sort();
  /* 打开时停在今天；今天不是上学日（周末、假期、数据范围外）就顺延到下一个有菜单的日子 */
  /* 今天有数据就停在今天（哪怕是放假日，那张卡会说明为什么没有菜单）；
     今天没有数据（周末、学年外）就跳到下一个真正有菜单的日子，别停在放假卡上 */
  const startDate = !dates.length
    ? today
    : dayMap[today]
    ? today
    : dates.find((d) => d > today && dayMap[d].type === "menu") ||
      dates.find((d) => d > today) ||
      dates[dates.length - 1];

  const [focus, setFocus] = useState(startDate);
  const [month, setMonth] = useState(monthOf(startDate));

  useEffect(() => {
    (async () => {
      const [m, n, p] = await Promise.all([
        store.get(K_MONTHS),
        store.get(K_NOTES),
        store.get(K_PREFS),
      ]);
      if (m) try { setLocalMonths(JSON.parse(m)); } catch {}
      if (n) try { setNotes(JSON.parse(n)); } catch {}
      if (p) try { setPrefs({ showZh: true, showVeg: false, ...JSON.parse(p) }); } catch {}
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) store.set(K_MONTHS, JSON.stringify(localMonths)); }, [localMonths, ready]);
  useEffect(() => { if (ready) store.set(K_NOTES, JSON.stringify(notes)); }, [notes, ready]);
  useEffect(() => { if (ready) store.set(K_PREFS, JSON.stringify(prefs)); }, [prefs, ready]);

  const setNote = useCallback((date, val) => {
    setNotes((prev) => {
      if ((prev[date] || "") === val) return prev;
      const next = { ...prev };
      if (val.trim()) next[date] = val;
      else delete next[date];
      return next;
    });
  }, []);

  /* 周视图：所有上课日连成一条，可以从周五直接滑到下周一 */
  const allDays = useMemo(() => {
    if (!dates.length) return [];
    const last = dates[dates.length - 1];
    const out = [];
    let cur = mondayOf(dates[0]);
    while (cur <= last) {
      for (let i = 0; i < 5; i++) out.push(addDays(cur, i));
      cur = addDays(cur, 7);
    }
    while (out.length && !dayMap[out[out.length - 1]]) out.pop();
    return out;
  }, [dayMap]);

  const scroller = useRef(null);
  const [visIdx, setVisIdx] = useState(0);

  const scrollToIdx = (i, behavior) => {
    const sc = scroller.current;
    const el = sc?.children[i];
    if (!sc || !el) return;
    sc.scrollTo({ left: el.offsetLeft - sc.children[0].offsetLeft, behavior });
    setVisIdx(i);
  };

  useEffect(() => {
    if (!ready || view !== "week" || !allDays.length) return;
    const i = allDays.indexOf(focus);
    scrollToIdx(i < 0 ? 0 : i, "auto");
  }, [ready, view, focus, allDays.length]);

  const onStripScroll = () => {
    const sc = scroller.current;
    const a = sc?.children[0];
    if (!sc || !a) return;
    const step = sc.children[1] ? sc.children[1].offsetLeft - a.offsetLeft : a.offsetWidth + 10;
    const i = Math.round(sc.scrollLeft / step);
    setVisIdx(Math.max(0, Math.min(allDays.length - 1, i)));
  };

  const jumpWeek = (n) => {
    const i = Math.max(0, Math.min(allDays.length - 1, visIdx + n * 5));
    if (allDays[i] === focus) scrollToIdx(i, "smooth");
    else setFocus(allDays[i]);
  };

  const visDate = allDays[visIdx] || focus;
  const visWeekStart = mondayOf(visDate);
  const homeIdx = allDays.indexOf(startDate);

  if (!ready) return <div style={{ ...shell, padding: 40, color: C.sub }}>载入中…</div>;

  return (
    <div style={shell}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 0 10px",
          position: "sticky",
          top: 0,
          background: C.paper,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
            SMIS LUNCH
          </div>
          <div style={{ fontSize: 10.5, color: C.sub, letterSpacing: 1, marginTop: 3 }}>
            CEZARS KITCHEN
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 3 }}>
          {["week", "month"].map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); if (v === "month") setMonth(monthOf(focus)); }}
              style={{
                border: "none",
                background: view === v ? C.band : "transparent",
                color: C.ink,
                fontWeight: 700,
                fontSize: 12.5,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: BODY,
              }}
            >
              {v === "week" ? "周" : "月"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSet(true)}
          aria-label="设置"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: C.card,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3.2" stroke={C.ink} strokeWidth="2" />
            <path
              d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7"
              stroke={C.ink}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {view === "week" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 10px" }}>
            <NavBtn disabled={visIdx <= 0} onClick={() => jumpWeek(-1)}>‹</NavBtn>
            <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: C.sub, fontWeight: 600 }}>
              {fmtDay(visWeekStart)} – {fmtDay(addDays(visWeekStart, 4))}
            </div>
            {homeIdx >= 0 && (
              <button
                onClick={() => { setFocus(startDate); scrollToIdx(homeIdx, "smooth"); }}
                disabled={visIdx === homeIdx}
                aria-label="回到今天"
                style={{
                  border: `1px solid ${visIdx === homeIdx ? C.line : C.gold}`,
                  background: visIdx === homeIdx ? "transparent" : C.card,
                  color: visIdx === homeIdx ? C.sub : C.ink,
                  borderRadius: 10,
                  height: 34,
                  padding: "0 11px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: visIdx === homeIdx ? "default" : "pointer",
                  fontFamily: BODY,
                  whiteSpace: "nowrap",
                }}
              >
                {dayMap[today] ? "今天" : "下个上学日"}
              </button>
            )}
            <NavBtn disabled={visIdx >= allDays.length - 1} onClick={() => jumpWeek(1)}>›</NavBtn>
          </div>
          <div
            ref={scroller}
            onScroll={onStripScroll}
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              paddingBottom: 8,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {allDays.map((d) => (
              <div
                key={d}
                style={{
                  flex: "0 0 var(--cardw)",
                  scrollSnapAlign: "start",
                }}
              >
                <DayCard
                  date={d}
                  day={dayMap[d]}
                  note={notes[d]}
                  onNote={setNote}
                  showZh={prefs.showZh}
                  showVeg={prefs.showVeg}
                  isToday={d === today}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <MonthView
          months={months}
          month={keys.includes(month) ? month : keys[0]}
          setMonth={setMonth}
          dayMap={dayMap}
          notes={notes}
          today={today}
          onPick={(d) => { setFocus(d); setView("week"); }}
        />
      )}

      <div style={{ fontSize: 10.5, color: C.sub, textAlign: "center", padding: "18px 0 8px", lineHeight: 1.7 }}>
        <a
          href="https://powerschool.smis.ac.jp/public/cezars.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: C.ink,
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: "none",
            border: `1px solid ${C.line}`,
            background: C.card,
            borderRadius: 999,
            padding: "7px 13px",
            marginBottom: 12,
          }}
        >
          最新版 lunch menu
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14 4h6v6M20 4l-8.5 8.5"
              stroke={C.gold}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"
              stroke={C.gold}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </a>
        <br />
        每日均含饮料 · 甜点在 Buffet Basic Plan 为可选
        <br />
        菜单可能因食材供应变动 · 营养值按中学生分量计算
      </div>

      {showSet && (
        <Settings
          months={months}
          localMonths={localMonths}
          setLocalMonths={setLocalMonths}
          notes={notes}
          setNotes={setNotes}
          prefs={prefs}
          setPrefs={setPrefs}
          onClose={() => setShowSet(false)}
        />
      )}
    </div>
  );
}

const shell = {
  minHeight: "100vh",
  background: C.paper,
  padding: "0 12px 24px",
  fontFamily: BODY,
  color: C.ink,
  maxWidth: 1080,
  margin: "0 auto",
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
