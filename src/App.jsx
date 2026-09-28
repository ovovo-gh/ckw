import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home,
  Library,
  BookOpen,
  Image as ImageIcon,
  Heart,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Lock,
  Globe,
  Package,
  Check,
  Clock,
  X,
  Trash2,
  Pencil,
  Download,
  Upload,
  RefreshCw,
  Star,
  Menu,
  FolderHeart,
  Loader2,
  ExternalLink,
  Camera,
  SlidersHorizontal,
} from "lucide-react";
import {
  api,
  setToken,
  token,
  mediaURL,
  upload,
  backup,
  downloadBlob,
} from "./api.js";
const nav = [
  ["home", "小小首页", Home],
  ["collection", "我们的收藏", Library],
  ["catalog", "玩偶图鉴", BookOpen],
  ["wallpapers", "壁纸放映室", ImageIcon],
  ["wishlist", "想买清单", Heart],
];
const characters = [
  "吉伊",
  "小八",
  "乌萨奇",
  "飞鼠",
  "栗子馒头",
  "海獭",
  "狮萨",
  "古本屋",
  "其他",
];
const categories = [
  "玩偶",
  "毛绒挂件",
  "杯子",
  "衣服",
  "亚克力挂件",
  "金属挂件",
  "其他",
];
const money = (n) =>
  n === null || n === undefined
    ? "未填写"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        maximumFractionDigits: 2,
      }).format(n);
const day = (s) => (s ? s.slice(0, 10).replaceAll("-", ".") : "—");
const initial = {
  collections: [],
  series: [],
  variants: [],
  wallpapers: [],
  wishes: [],
  user: null,
};
function Button({ children, className = "", variant = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Empty({ title, description, action, icon: Icon = FolderHeart }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={32} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Picture({ item, className = "", alt, contain = false }) {
  const [src, setSrc] = useState(item?.image || "");
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  const imageId = item?.images?.[0];
  useEffect(() => {
    setFailed(false);
    setSrc(imageId ? "" : item?.image || "");
    if (!imageId) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          mediaURL(imageId)
            .then((url) => {
              if (alive) setSrc(url);
            })
            .catch(() => {
              if (alive) setFailed(true);
            });
        }
      },
      { rootMargin: "150px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [imageId, item?.image, token]);
  return (
    <div
      ref={ref}
      className={`picture ${contain ? "contain" : ""} ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt ?? item?.name ?? ""}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="photo-placeholder">
          <ImageIcon size={30} />
          <span>{failed ? "图片加载失败" : "还没有照片"}</span>
        </span>
      )}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Field({ label, children, hint, full = false }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export default function App() {
  const [state, setState] = useState(initial),
    [page, setPage] = useState(location.hash.slice(1) || "home"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [character, setCharacter] = useState("全部角色"),
    [category, setCategory] = useState("全部类别"),
    [status, setStatus] = useState("全部状态"),
    [device, setDevice] = useState("all"),
    [seriesId, setSeriesId] = useState(""),
    [backupBusy, setBackupBusy] = useState("");
  const toastTimer = useRef();
  const mounted = useRef(true);
  const refreshSeq = useRef(0);
  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const next = await api("snapshot");
      if (!mounted.current || seq !== refreshSeq.current) return;
      setState(next);
      if (!next.user && token) {
        setToken("");
        setModal(null);
      }
      setError("");
    } catch (e) {
      if (seq === refreshSeq.current) setError(e.message);
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    const handler = () =>
      setPage(
        nav.some((n) => n[0] === location.hash.slice(1))
          ? location.hash.slice(1)
          : "home",
      );
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  function go(next) {
    setPage(next);
    location.hash = next;
    setMenu(false);
    setSearch("");
    setCharacter("全部角色");
    setCategory("全部类别");
    setStatus("全部状态");
    setSeriesId("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function requireLogin(fn) {
    if (state.user) fn();
    else setModal({ type: "login" });
  }
  const owned = new Set(
    state.collections
      .filter((x) => x.status === "arrived")
      .map((x) => x.variantId)
      .filter(Boolean),
  );
  const wished = new Set(state.wishes.map((x) => x.variantId));
  const ordered = state.collections.filter(
    (x) => x.status === "ordered",
  ).length;
  const query = search.trim().toLowerCase();
  const filtered = state.collections.filter(
    (x) =>
      (!query ||
        [x.name, x.character, x.category, x.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)) &&
      (character === "全部角色" || x.character === character) &&
      (category === "全部类别" || x.category === category) &&
      (status === "全部状态" ||
        (status === "已到手"
          ? x.status === "arrived"
          : status === "已下单"
            ? x.status === "ordered"
            : x.private)),
  );
  const filteredVariants = state.variants.filter(
    (x) =>
      (!seriesId || x.seriesId === seriesId) &&
      (!query ||
        [x.name, x.originalName, x.character]
          .join(" ")
          .toLowerCase()
          .includes(query)) &&
      (character === "全部角色" || x.character === character),
  );
  const allWallpapers = state.wallpapers.filter(
    (x) =>
      (device === "all" ||
        x.device === device ||
        x.compatibleDevices?.includes(device)) &&
      (!query || x.name.toLowerCase().includes(query)),
  );
  const activeSeries = state.series.find((x) => x.id === seriesId);
  async function mutate(action, data, message) {
    try {
      await api(action, data);
      await refresh();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }
  function edit(kind, item) {
    requireLogin(() => setModal({ type: "edit", kind, item }));
  }
  function addFrom(variant) {
    requireLogin(() =>
      setModal({
        type: "edit",
        kind: "collection",
        item: {
          name: variant.name,
          character: variant.character,
          category: variant.type === "plush-charm" ? "毛绒挂件" : "玩偶",
          variantId: variant.id,
          status: "arrived",
        },
      }),
    );
  }
  async function logout() {
    try {
      await api("logout");
      setToken("");
      setModal(null);
      setState(initial);
      await refresh();
      notify("已退出登录");
    } catch (e) {
      notify(e.message);
    }
  }
  async function doBackup() {
    setBackupBusy("准备中");
    try {
      await backup(setBackupBusy);
      notify("备份已下载，请妥善保存");
    } catch (e) {
      notify(e.message);
    } finally {
      setBackupBusy("");
    }
  }
  const collectionCard = (x) => (
    <article className="collection-card" key={x.id}>
      <button
        className="card-open"
        onClick={() =>
          setModal({ type: "detail", kind: "collection", item: x })
        }
      >
        <Picture item={x} />
        <div className="card-tags">
          <span
            className={`badge ${x.status === "ordered" ? "yellow" : "blue"}`}
          >
            {x.status === "ordered" ? "在路上" : "已到手"}
          </span>
          {x.private ? (
            <span className="badge">
              <Lock size={11} />
              私密
            </span>
          ) : null}
        </div>
        <div className="card-body">
          <small>
            {x.category} {x.character ? `· ${x.character}` : ""}
          </small>
          <h3>{x.name}</h3>
          <div className="card-bottom">
            <span>{state.user ? money(x.price) : "我们的收藏"}</span>
            <ChevronRight size={16} />
          </div>
        </div>
      </button>
    </article>
  );
  const variantCard = (x) => (
    <article className="variant-card" key={x.id}>
      <button
        className={`heart-button ${wished.has(x.id) ? "selected" : ""}`}
        aria-label={wished.has(x.id) ? `取消想买 ${x.name}` : `想买 ${x.name}`}
        onClick={() =>
          requireLogin(() =>
            mutate(
              "wish",
              { variantId: x.id, wanted: !wished.has(x.id) },
              wished.has(x.id) ? "已移出想买清单" : "已加入想买清单",
            ),
          )
        }
      >
        <Heart size={18} fill={wished.has(x.id) ? "currentColor" : "none"} />
      </button>
      <button
        className="card-open"
        onClick={() => setModal({ type: "detail", kind: "variant", item: x })}
      >
        <Picture item={x} contain />
        <div className="card-body">
          <small>{state.series.find((s) => s.id === x.seriesId)?.name}</small>
          <h3>{x.name}</h3>
          <span className={`badge ${owned.has(x.id) ? "blue" : "neutral"}`}>
            {owned.has(x.id) ? (
              <>
                <Check size={12} />
                已拥有
              </>
            ) : (
              "等待点亮"
            )}
          </span>
        </div>
      </button>
    </article>
  );
  return (
    <div className="app-shell">
      {menu ? (
        <button
          className="nav-scrim"
          onClick={() => setMenu(false)}
          aria-label="关闭导航"
        />
      ) : null}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            c<span>✦</span>
          </span>
          <span>
            chiikawa<span className="brand-space">space</span>
          </span>
        </a>
        <span className="nav-caption">OUR LITTLE WORLD</span>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "collection" && state.collections.length ? (
                <span className="nav-count">{state.collections.length}</span>
              ) : null}
              {id === "wishlist" && state.user && wished.size ? (
                <span className="nav-count">{wished.size}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Star size={18} />
          <p>
            喜欢的小东西，
            <br />
            都值得好好收藏。
          </p>
          <span>made for the two of us ♡</span>
        </div>
        <div className="sidebar-bottom">
          {state.user ? (
            <>
              <div className="user-line">
                <span className="avatar">{state.user.label}</span>
                <span>
                  <strong>欢迎回来，{state.user.label}</strong>
                  <small>一起照看收藏室</small>
                </span>
              </div>
              <div className="account-actions">
                <button onClick={doBackup} disabled={!!backupBusy}>
                  <Download size={15} />
                  {backupBusy || "导出备份"}
                </button>
                <button onClick={logout}>
                  <LogOut size={15} />
                  退出
                </button>
              </div>
            </>
          ) : (
            <>
              <p>两个人的小小收藏室</p>
              <Button
                onClick={() => setModal({ type: "login" })}
                variant="outline"
              >
                <LogIn size={16} />
                维护者登录
              </Button>
            </>
          )}
          <span className="test-label">免费测试版</span>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>我们的收藏室</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="top-actions">
            <span className="top-note">a little happiness, every day</span>
            <button
              className="icon-button"
              aria-label="刷新数据"
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
            {state.user ? (
              <span className="avatar small">{state.user.label}</span>
            ) : (
              <button
                className="text-button"
                onClick={() => setModal({ type: "login" })}
              >
                <LogIn size={16} />
                登录
              </button>
            )}
          </div>
        </header>
        <main>
          {error ? (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={refresh}>重试</button>
            </div>
          ) : null}
          {loading ? (
            <div className="loading-panel">
              <Loader2 className="spin" />
              <p>正在打开我们的小小世界…</p>
            </div>
          ) : (
            <>
              {page === "home" ? (
                <>
                  <section className="welcome">
                    <div className="welcome-copy">
                      <span className="eyebrow">
                        <span />
                        WELCOME TO OUR SPACE
                      </span>
                      <h1>
                        把小小的喜欢，
                        <br />
                        慢慢收集成日常<span className="pink-star">✧</span>
                      </h1>
                      <p>每一只小可爱，都有属于我们的故事。</p>
                      <div className="welcome-actions">
                        <Button onClick={() => edit("collection", {})}>
                          <Plus size={17} />
                          记下一件收藏
                        </Button>
                        <button
                          className="text-button"
                          onClick={() => go("catalog")}
                        >
                          逛逛图鉴
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="hero-photos" aria-label="宝宝系列玩偶">
                      <span className="paper-note">
                        small things,
                        <br />
                        big happiness ♡
                      </span>
                      {state.variants.slice(3, 6).map((x, i) => (
                        <div className={`polaroid p${i}`} key={x.id}>
                          <img src={x.image} alt={x.name} />
                          <span>{x.character} ♡</span>
                        </div>
                      ))}
                      <span className="hero-sparkle">✦</span>
                      <span className="hero-loop">♡</span>
                    </div>
                  </section>
                  <section className="stats">
                    <button className="stat" onClick={() => go("collection")}>
                      <span className="stat-icon blue">
                        <Library />
                      </span>
                      <div>
                        <span>珍藏的小可爱</span>
                        <strong>
                          {state.collections.length}
                          <small>件</small>
                        </strong>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                    <button
                      className="stat"
                      onClick={() => {
                        go("collection");
                        setStatus("已下单");
                      }}
                    >
                      <span className="stat-icon yellow">
                        <Package />
                      </span>
                      <div>
                        <span>正在奔向我们</span>
                        <strong>
                          {ordered}
                          <small>件</small>
                        </strong>
                      </div>
                    </button>
                    <button className="stat" onClick={() => go("catalog")}>
                      <span className="stat-icon green">
                        <BookOpen />
                      </span>
                      <div>
                        <span>已点亮图鉴</span>
                        <strong>
                          {owned.size}
                          <small>/ {state.variants.length} 款</small>
                        </strong>
                      </div>
                    </button>
                    <button className="stat" onClick={() => go("wallpapers")}>
                      <span className="stat-icon pink">
                        <ImageIcon />
                      </span>
                      <div>
                        <span>随时换个心情</span>
                        <strong>
                          {state.wallpapers.length}
                          <small>张壁纸</small>
                        </strong>
                      </div>
                    </button>
                  </section>
                  <section className="section">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">OUR COLLECTION</span>
                        <h2>
                          最近收进的小幸福 <span>♡</span>
                        </h2>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("collection")}
                      >
                        全部收藏
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {state.collections.length ? (
                      <div className="collection-grid">
                        {[...state.collections]
                          .sort((a, b) =>
                            b.createdAt.localeCompare(a.createdAt),
                          )
                          .slice(0, 4)
                          .map(collectionCard)}
                      </div>
                    ) : (
                      <div className="first-collection">
                        <span className="empty-icon">
                          <Camera size={30} />
                        </span>
                        <div>
                          <h3>故事，从第一件收藏开始</h3>
                          <p>
                            拍张照片，记下名字。以后再看，也会想起收到它的那一天。
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => edit("collection", {})}
                        >
                          <Plus size={16} />
                          添加第一件
                        </Button>
                      </div>
                    )}
                  </section>
                  <section className="section">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">A LITTLE FIELD GUIDE</span>
                        <h2>今天想遇见哪一只？</h2>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("catalog")}
                      >
                        打开玩偶图鉴
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="series-preview">
                      {state.series.slice(0, 4).map((s, i) => (
                        <button
                          className={`series-preview-card tint-${i}`}
                          key={s.id}
                          onClick={() => {
                            go("catalog");
                            setSeriesId(s.id);
                          }}
                        >
                          <Picture
                            item={state.variants.find(
                              (v) => v.seriesId === s.id,
                            )}
                            contain
                          />
                          <div>
                            <small>SERIES 0{i + 1}</small>
                            <h3>{s.name}</h3>
                            <span>
                              已收录{" "}
                              {
                                state.variants.filter(
                                  (v) => v.seriesId === s.id,
                                ).length
                              }{" "}
                              款<ArrowUpRight size={16} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                  <button
                    className="wallpaper-banner"
                    onClick={() => go("wallpapers")}
                  >
                    <div>
                      <span className="eyebrow">WALLPAPER ROOM</span>
                      <h2>给屏幕，也换上小小的快乐。</h2>
                      <span>
                        手机 · 电脑 · 平板 <ArrowUpRight size={17} />
                      </span>
                    </div>
                    <div className="wallpaper-mini">
                      {state.wallpapers.slice(0, 3).map((w) => (
                        <img key={w.id} src={w.image} alt="" />
                      ))}
                    </div>
                  </button>
                </>
              ) : null}
              {page !== "home" ? (
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {page === "collection"
                        ? "OUR COLLECTION"
                        : page === "catalog"
                          ? "CHIIKAWA FIELD GUIDE"
                          : page === "wallpapers"
                            ? "WALLPAPER ROOM"
                            : "OUR WISHLIST"}
                    </span>
                    <h1>
                      {nav.find((n) => n[0] === page)?.[1]}
                      <span className="heading-flower">✳</span>
                    </h1>
                    <p>
                      {page === "collection"
                        ? "每一件都独一无二，连同它的小故事。"
                        : page === "catalog"
                          ? "认识每个系列，把喜欢的一只只点亮。"
                          : page === "wallpapers"
                            ? "让喜欢的小伙伴，陪在每一块屏幕上。"
                            : "把心动先放在这里，等合适的时候相遇。"}
                    </p>
                  </div>
                  {page === "collection" ? (
                    <Button onClick={() => edit("collection", {})}>
                      <Plus size={17} />
                      新增收藏
                    </Button>
                  ) : page === "catalog" && state.user ? (
                    <div className="heading-actions">
                      <Button
                        variant="outline"
                        onClick={() => edit("series", {})}
                      >
                        新增系列
                      </Button>
                      <Button onClick={() => edit("variant", { seriesId })}>
                        <Plus size={17} />
                        补充款式
                      </Button>
                    </div>
                  ) : page === "wallpapers" ? (
                    <Button onClick={() => edit("wallpaper", {})}>
                      <Upload size={17} />
                      上传壁纸
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {["collection", "catalog", "wallpapers"].includes(page) ? (
                <div className="toolbar">
                  <label className="search">
                    <Search size={18} />
                    <input
                      aria-label="搜索"
                      placeholder={
                        page === "collection"
                          ? "寻找一件收藏…"
                          : page === "catalog"
                            ? "搜索款式、角色…"
                            : "寻找一张壁纸…"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        aria-label="清空搜索"
                        onClick={() => setSearch("")}
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </label>
                  {page !== "wallpapers" ? (
                    <select
                      aria-label="角色筛选"
                      value={character}
                      onChange={(e) => setCharacter(e.target.value)}
                    >
                      {["全部角色", ...characters].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : null}
                  {page === "collection" ? (
                    <>
                      <select
                        aria-label="类别筛选"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {["全部类别", ...categories].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        aria-label="状态筛选"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        {[
                          "全部状态",
                          "已到手",
                          "已下单",
                          ...(state.user ? ["仅私密"] : []),
                        ].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  {page === "catalog" ? (
                    <select
                      aria-label="系列筛选"
                      value={seriesId}
                      onChange={(e) => setSeriesId(e.target.value)}
                    >
                      <option value="">全部系列</option>
                      {state.series.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}
              {page === "collection" ? (
                <>
                  <div className="result-summary">
                    <span>共 {filtered.length} 件收藏</span>
                    {state.user ? (
                      <span>
                        <Lock size={13} />
                        价格和备注只有我们可见 · 合计{" "}
                        {money(
                          filtered.reduce((s, x) => s + (x.price || 0), 0),
                        )}
                      </span>
                    ) : (
                      <span>正在浏览公开收藏</span>
                    )}
                  </div>
                  {filtered.length ? (
                    <div className="collection-grid">
                      {filtered.map(collectionCard)}
                    </div>
                  ) : (
                    <Empty
                      title={
                        search ||
                        status !== "全部状态" ||
                        category !== "全部类别" ||
                        character !== "全部角色"
                          ? "没有找到这件小可爱"
                          : "收藏架还空着"
                      }
                      description="可以换个关键词，或记下你们的第一件收藏。"
                      action={
                        <Button onClick={() => edit("collection", {})}>
                          <Plus size={16} />
                          新增收藏
                        </Button>
                      }
                    />
                  )}
                </>
              ) : null}
              {page === "catalog" ? (
                <>
                  {!seriesId && !query && character === "全部角色" ? (
                    <div className="series-grid">
                      {state.series.map((s, i) => {
                        const variants = state.variants.filter(
                            (v) => v.seriesId === s.id,
                          ),
                          count = variants.filter((v) =>
                            owned.has(v.id),
                          ).length;
                        return (
                          <article
                            className={`series-card tint-${i % 4}`}
                            key={s.id}
                          >
                            <button
                              className="series-card-main"
                              onClick={() => setSeriesId(s.id)}
                            >
                              <div className="series-montage">
                                {variants.slice(0, 3).map((v) => (
                                  <Picture key={v.id} item={v} contain />
                                ))}
                              </div>
                              <div className="series-card-copy">
                                <small>
                                  SERIES {String(i + 1).padStart(2, "0")}
                                </small>
                                <h2>{s.name}</h2>
                                <div className="series-progress">
                                  <span>
                                    {count} / {variants.length} 款已到手
                                  </span>
                                  <ChevronRight size={18} />
                                </div>
                                <div className="progress-track">
                                  <span
                                    style={{
                                      width: `${variants.length ? (count / variants.length) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </button>
                            {state.user ? (
                              <button
                                className="series-edit icon-button"
                                aria-label={`编辑系列 ${s.name}`}
                                onClick={() => edit("series", s)}
                              >
                                <Pencil size={15} />
                              </button>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="result-summary">
                        <button
                          className="text-button"
                          onClick={() => {
                            setSeriesId("");
                            setSearch("");
                            setCharacter("全部角色");
                          }}
                        >
                          <ArrowLeft size={16} />
                          全部系列
                        </button>
                        <span>
                          {activeSeries?.name || "搜索结果"} ·{" "}
                          {filteredVariants.length} 款
                        </span>
                      </div>
                      <div className="variant-grid">
                        {filteredVariants.map(variantCard)}
                      </div>
                      {!filteredVariants.length ? (
                        <Empty
                          title="这里还没有款式"
                          description="可以自己补充一只小可爱。"
                          action={
                            <Button
                              onClick={() => edit("variant", { seriesId })}
                            >
                              补充款式
                            </Button>
                          }
                        />
                      ) : null}
                    </>
                  )}
                  <p className="catalog-note">
                    图鉴收录普通玩偶与毛绒挂件；进度以本站已收录款式为基准，不代表官方完整系列。中文名称为整理译名。
                  </p>
                </>
              ) : null}
              {page === "wallpapers" ? (
                <>
                  <div
                    className="device-tabs"
                    role="group"
                    aria-label="壁纸设备分类"
                  >
                    {[
                      ["all", "全部壁纸"],
                      ["phone", "手机"],
                      ["desktop", "电脑"],
                      ["tablet", "平板可用"],
                    ].map(([id, label]) => (
                      <button
                        className={device === id ? "active" : ""}
                        key={id}
                        onClick={() => setDevice(id)}
                      >
                        {label}
                      </button>
                    ))}
                    <span>{allWallpapers.length} 张</span>
                  </div>
                  {device === "tablet" ? (
                    <p className="inline-note">
                      精选横屏图片，可用于平板；请根据屏幕比例调整裁切。
                    </p>
                  ) : null}
                  <div
                    className={`wallpaper-grid ${device === "desktop" || device === "tablet" ? "landscape" : ""}`}
                  >
                    {allWallpapers.map((w) => (
                      <article
                        className={`wallpaper-card ${w.device === "desktop" ? "desktop" : ""}`}
                        key={w.id}
                      >
                        <button
                          className="card-open"
                          onClick={() =>
                            setModal({
                              type: "detail",
                              kind: "wallpaper",
                              item: w,
                            })
                          }
                        >
                          <Picture item={w} />
                          <div className="wallpaper-caption">
                            <h3>{w.name}</h3>
                            <span>
                              {w.width} × {w.height}
                              <ArrowUpRight size={17} />
                            </span>
                          </div>
                        </button>
                      </article>
                    ))}
                  </div>
                  {!allWallpapers.length ? (
                    <Empty
                      title="暂时没有这个分类的壁纸"
                      description="换个分类看看，或者上传你喜欢的图片。"
                    />
                  ) : null}
                </>
              ) : null}
              {page === "wishlist" ? (
                state.user ? (
                  <>
                    {wished.size ? (
                      <>
                        <div className="result-summary">
                          <span>{wished.size} 份小小的期待</span>
                          <span>
                            <Lock size={13} />
                            只有我们可见
                          </span>
                        </div>
                        <div className="variant-grid">
                          {state.variants
                            .filter((v) => wished.has(v.id))
                            .map(variantCard)}
                        </div>
                      </>
                    ) : (
                      <Empty
                        icon={Heart}
                        title="下一份心动，会是哪一只？"
                        description="逛逛图鉴，点一下爱心，就能把喜欢的款式放在这里。"
                        action={
                          <Button onClick={() => go("catalog")}>
                            去逛图鉴
                            <ArrowUpRight size={16} />
                          </Button>
                        }
                      />
                    )}
                  </>
                ) : (
                  <Empty
                    icon={Lock}
                    title="这是两个人的小秘密"
                    description="登录后，就能查看和编辑我们的想买清单。"
                    action={
                      <Button onClick={() => setModal({ type: "login" })}>
                        <LogIn size={16} />
                        登录收藏室
                      </Button>
                    }
                  />
                )
              ) : null}
            </>
          )}
          <footer>
            <span>
              chiikawa space <span className="footer-heart">♡</span>{" "}
              收藏平凡日子里的小小快乐
            </span>
            <span>非官方个人收藏站 · 图片版权归原作者</span>
          </footer>
        </main>
      </div>
      {toast ? (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      ) : null}
      {modal?.type === "login" ? (
        <Login
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await refresh();
            notify("欢迎回到我们的小小世界");
          }}
        />
      ) : null}
      {modal?.type === "edit" ? (
        <Editor
          kind={modal.kind}
          item={modal.item}
          state={state}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
            notify("已保存到我们的收藏室");
          }}
          onDelete={(item) =>
            setModal({ type: "delete", kind: modal.kind, item })
          }
        />
      ) : null}
      {modal?.type === "delete" ? (
        <Modal title="确认删除？" onClose={() => setModal(null)}>
          <div className="modal-body">
            <p>删除「{modal.item.name}」后，它将不再出现在收藏室中。</p>
            <p className="muted">此操作不能直接撤销。</p>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setModal(null)}>
                保留
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    await mutate(
                      "delete",
                      {
                        kind: modal.kind,
                        id: modal.item.id,
                        rev: modal.item.rev,
                      },
                      "已删除",
                    )
                  )
                    setModal(null);
                }}
              >
                <Trash2 size={16} />
                确认删除
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {modal?.type === "detail" ? (
        <Detail
          kind={modal.kind}
          item={modal.item}
          state={state}
          owned={owned}
          wished={wished}
          onClose={() => setModal(null)}
          onEdit={() => edit(modal.kind, modal.item)}
          onAdd={() => addFrom(modal.item)}
          onWish={() =>
            requireLogin(() =>
              mutate(
                "wish",
                {
                  variantId: modal.item.id,
                  wanted: !wished.has(modal.item.id),
                },
                "想买清单已更新",
              ),
            )
          }
          notify={notify}
        />
      ) : null}
    </div>
  );
}

function Login({ onClose, onDone }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api("login", {
        username: d.get("username"),
        password: d.get("password"),
      });
      setToken(r.token);
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="回到我们的收藏室" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <p className="form-intro">登录后，继续记录属于我们的小小快乐。</p>
        <Field label="账号">
          <input
            name="username"
            autoComplete="username"
            required
            placeholder="你的账号"
            autoFocus
          />
        </Field>
        <Field label="密码">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="输入密码"
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="full-button" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
          登录
        </Button>
        <p className="form-footnote">
          <Lock size={12} />
          只开放给两位维护者，没有公开注册。
        </p>
      </form>
    </Modal>
  );
}

function Editor({ kind, item, state, onClose, onSaved, onDelete }) {
  const [draft, setDraft] = useState({
    name: "",
    price: "",
    notes: "",
    purchaseDate: "",
    channel: "",
    character: "吉伊",
    category: "玩偶",
    status: "arrived",
    private: false,
    variantId: "",
    seriesId: state.series[0]?.id || "",
    sourceUrl: "",
    description: "",
    device: "phone",
    author: "",
    images: [],
    ...item,
  });
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const update = (k, v) => setDraft((old) => ({ ...old, [k]: v }));
  const title = {
    collection: "收藏",
    series: "系列",
    variant: "图鉴款式",
    wallpaper: "壁纸",
  }[kind];
  async function photos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setError("");
    const limit = kind === "wallpaper" ? 1 : 8;
    if (draft.images.length + files.length > limit) {
      setError(`最多上传 ${limit} 张图片`);
      return;
    }
    setUploading(true);
    try {
      for (const f of files) {
        const result = await upload(f, { wallpaper: kind === "wallpaper" });
        setDraft((d) => ({
          ...d,
          images: [...d.images, result.id],
          ...(kind === "wallpaper"
            ? {
                width: result.width,
                height: result.height,
                device: result.width > result.height ? "desktop" : "phone",
              }
            : {}),
        }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("save", { kind, id: item.id, rev: item.rev, data: draft });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${item.id ? "编辑" : "新增"}${title}`}
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
      wide
    >
      <form onSubmit={save} className="modal-body">
        <div className="form-grid">
          <Field label={`${title}名称 *`} full>
            <input
              required
              autoFocus
              maxLength={200}
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder={
                kind === "collection" ? "给这件小可爱起个名字" : "填写名称"
              }
            />
          </Field>
          {kind !== "series" ? (
            <div className="field full">
              <span>{kind === "wallpaper" ? "壁纸原图" : "照片"}</span>
              <div className="photo-upload-list">
                {draft.images.map((id) => (
                  <div className="upload-thumb" key={id}>
                    <Picture item={{ images: [id], name: "已上传照片" }} />
                    <button
                      type="button"
                      aria-label="移除照片"
                      onClick={() =>
                        update(
                          "images",
                          draft.images.filter((x) => x !== id),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {draft.images.length < (kind === "wallpaper" ? 1 : 8) ? (
                  <label
                    role="button"
                    tabIndex={0}
                    aria-label="添加图片"
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        !uploading &&
                        !busy
                      ) {
                        e.preventDefault();
                        e.currentTarget.querySelector("input").click();
                      }
                    }}
                    className={`upload-zone ${uploading ? "disabled" : ""}`}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple={kind !== "wallpaper"}
                      onChange={photos}
                      disabled={uploading || busy}
                    />
                    {uploading ? <Loader2 className="spin" /> : <Plus />}
                    <span>{uploading ? "正在上传" : "添加图片"}</span>
                  </label>
                ) : null}
              </div>
              <small>
                {kind === "wallpaper"
                  ? "保留原始画质，支持 JPG / PNG / WebP，单张不超过 3 MB。"
                  : "最多 8 张，自动压缩大照片。支持 JPG / PNG / WebP。"}
                {item.image && !draft.images.length
                  ? " 当前使用官方参考图；上传后将替换展示。"
                  : ""}
              </small>
            </div>
          ) : null}
          {kind === "collection" || kind === "variant" ? (
            <Field label="角色">
              <select
                value={draft.character}
                onChange={(e) => update("character", e.target.value)}
              >
                {characters.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {kind === "collection" ? (
            <>
              <Field label="类别">
                <select
                  value={draft.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {categories.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="价格（人民币）" hint="仅我们可见">
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.01"
                  placeholder="可以以后补填"
                  value={draft.price ?? ""}
                  onChange={(e) => update("price", e.target.value)}
                />
              </Field>
              <Field label="购买日期">
                <input
                  type="date"
                  value={draft.purchaseDate}
                  onChange={(e) => update("purchaseDate", e.target.value)}
                />
              </Field>
              <Field label="购买渠道">
                <input
                  value={draft.channel}
                  onChange={(e) => update("channel", e.target.value)}
                  placeholder="例如：线下店 / 代购"
                />
              </Field>
              <Field label="当前状态">
                <select
                  value={draft.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  <option value="arrived">已到手</option>
                  <option value="ordered">已下单</option>
                </select>
              </Field>
              <Field
                label="关联图鉴款式（可选）"
                full
                hint="已到手的收藏会自动点亮对应款式。"
              >
                <select
                  value={draft.variantId}
                  onChange={(e) => update("variantId", e.target.value)}
                >
                  <option value="">暂不关联</option>
                  {state.series.map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {state.variants
                        .filter((v) => v.seriesId === s.id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field
                label="私人备注"
                full
                hint="无论收藏是否公开，备注都只有我们能看到。"
              >
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="在哪一天遇见它？又有什么特别的故事？"
                />
              </Field>
              <label className="privacy-control full">
                <input
                  type="checkbox"
                  checked={draft.private}
                  onChange={(e) => update("private", e.target.checked)}
                />
                <span>
                  <strong>
                    <Lock size={15} />
                    只给我们看
                  </strong>
                  <small>开启后，整条收藏和照片对访客隐藏。</small>
                </span>
              </label>
            </>
          ) : null}
          {kind === "variant" ? (
            <>
              <Field label="所属系列 *">
                <select
                  required
                  value={draft.seriesId}
                  onChange={(e) => update("seriesId", e.target.value)}
                >
                  <option value="">请选择</option>
                  {state.series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="日文原名（可选）" full>
                <input
                  value={draft.originalName || ""}
                  onChange={(e) => update("originalName", e.target.value)}
                />
              </Field>
            </>
          ) : null}
          {kind === "series" ? (
            <Field label="系列说明" full>
              <textarea
                rows={3}
                maxLength={1000}
                value={draft.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
          ) : null}
          {kind === "wallpaper" ? (
            <>
              <Field label="设备分类">
                <select
                  value={draft.device}
                  onChange={(e) => update("device", e.target.value)}
                >
                  <option value="phone">手机</option>
                  <option value="desktop">电脑</option>
                  <option value="tablet">平板</option>
                </select>
              </Field>
              <Field label="作者 / 来源名称">
                <input
                  value={draft.author}
                  onChange={(e) => update("author", e.target.value)}
                  placeholder="保留原作者信息"
                />
              </Field>
            </>
          ) : null}
          {kind !== "collection" ? (
            <Field label="来源链接（可选）" full>
              <input
                type="url"
                value={draft.sourceUrl}
                onChange={(e) => update("sourceUrl", e.target.value)}
                placeholder="https://"
              />
            </Field>
          ) : null}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          {item.id ? (
            <button
              type="button"
              className="text-button danger-text"
              disabled={busy || uploading}
              onClick={() => onDelete(item)}
            >
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
          <div className="spacer" />
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={onClose}
          >
            取消
          </Button>
          <Button disabled={busy || uploading}>
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            保存{title}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Detail({
  kind,
  item,
  state,
  owned,
  wished,
  onClose,
  onEdit,
  onAdd,
  onWish,
  notify,
}) {
  const [index, setIndex] = useState(0),
    [downloading, setDownloading] = useState(false);
  const images = item.images?.length ? item.images : [null];
  const view = images[index] ? { ...item, images: [images[index]] } : item;
  async function download() {
    setDownloading(true);
    try {
      const u = await mediaURL(item.images[0]);
      const blob = await fetch(u).then((r) => r.blob());
      downloadBlob(blob, `${item.name}.${blob.type.split("/")[1] || "jpg"}`);
    } catch (e) {
      notify(e.message);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Modal
      title={
        kind === "collection"
          ? "一件小小收藏"
          : kind === "variant"
            ? "图鉴里的小可爱"
            : "壁纸放映室"
      }
      onClose={onClose}
      wide
    >
      <div className="detail-body">
        <div
          className={`detail-image ${kind === "wallpaper" ? "wallpaper-detail" : ""}`}
        >
          <Picture item={view} contain />
          {images.length > 1 ? (
            <div className="photo-dots">
              {images.map((id, i) => (
                <button
                  key={id}
                  aria-label={`查看第 ${i + 1} 张照片`}
                  className={i === index ? "active" : ""}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="detail-copy">
          <span className="eyebrow">
            {kind === "collection"
              ? item.category
              : kind === "variant"
                ? state.series.find((s) => s.id === item.seriesId)?.name
                : item.device === "phone"
                  ? "手机壁纸"
                  : item.device === "tablet"
                    ? "平板壁纸"
                    : "电脑壁纸"}
          </span>
          <h2>{item.name}</h2>
          {item.originalName ? (
            <p className="original-name">{item.originalName}</p>
          ) : null}
          {kind === "collection" ? (
            <>
              <span
                className={`badge ${item.status === "arrived" ? "blue" : "yellow"}`}
              >
                {item.status === "arrived" ? "已到手" : "已下单 · 在路上"}
              </span>
              {state.user ? (
                <>
                  <dl>
                    <div>
                      <dt>购买价格</dt>
                      <dd>{money(item.price)}</dd>
                    </div>
                    <div>
                      <dt>购买日期</dt>
                      <dd>{day(item.purchaseDate)}</dd>
                    </div>
                    <div>
                      <dt>购买渠道</dt>
                      <dd>{item.channel || "未填写"}</dd>
                    </div>
                    <div>
                      <dt>可见范围</dt>
                      <dd>{item.private ? "仅我们" : "公开"}</dd>
                    </div>
                  </dl>
                  <div className="private-note">
                    <span>
                      <Lock size={13} />
                      私人备注
                    </span>
                    <p>{item.notes || "还没有留下备注。"}</p>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
          {kind === "variant" ? (
            <>
              <p>
                {item.character} ·{" "}
                {owned.has(item.id)
                  ? "已经在我们的收藏里啦"
                  : "还在等待与我们相遇"}
              </p>
              <div className="detail-actions">
                <Button onClick={onAdd}>
                  <Plus size={16} />
                  记一件收藏
                </Button>
                <Button variant="outline" onClick={onWish}>
                  <Heart
                    size={16}
                    fill={wished.has(item.id) ? "currentColor" : "none"}
                  />
                  {wished.has(item.id) ? "已加入想买" : "想买这只"}
                </Button>
              </div>
            </>
          ) : null}
          {kind === "wallpaper" ? (
            <>
              <p className="image-resolution">
                {item.width} × {item.height}
              </p>
              <p className="muted">{item.author}</p>
              {item.fitNote ? <p>{item.fitNote}</p> : null}
              <p className="muted small-text">
                {item.sourceOnly
                  ? "本站展示精选预览。官方原图请在来源页面保存；来源网站的访问情况可能不同。"
                  : "保留上传时的原始画质。"}
              </p>
              {item.images?.length ? (
                <Button onClick={download} disabled={downloading}>
                  <Download size={16} />
                  {downloading ? "准备原图…" : "下载原图"}
                </Button>
              ) : (
                <a
                  className="button"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  前往原图来源
                  <ExternalLink size={16} />
                </a>
              )}
            </>
          ) : null}
          {item.sourceUrl ? (
            <a
              className="source-link"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              查看原始来源
            </a>
          ) : null}
          {state.user ? (
            <div className="detail-edit">
              <Button variant="outline" onClick={onEdit}>
                <Pencil size={15} />
                编辑
                {kind === "collection"
                  ? "收藏"
                  : kind === "variant"
                    ? "款式"
                    : "壁纸"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
