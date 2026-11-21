// ==UserScript==
// @name         学习通自动化 油猴
// @namespace    https://github.com/miejianguo/cx-auto-study
// @version      55.0
// @description  学习通自动刷课：2x自适应降速 / 自动答弹题 / 章节测验（不配Key随机，配了DeepSeek Key就AI答题）/ 卡住三级自救 / 一键清痕迹
// @author       灭建国
// @match        https://*.chaoxing.com/*
// @match        http://*.chaoxing.com/*
// @match        https://*.edu.cn/*
// @match        https://*.xueyinonline.com/*
// @match        https://*.icve.com.cn/*
// @match        https://*.zhihuishu.com/*
// @match        https://*.yuketang.cn/*
// @match        https://*.icourse163.org/*
// @match        https://*.courshare.cn/*
// @match        https://*.webtrn.cn/*
// @connect      api.deepseek.com
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

/* ============================================================
 *  功能：
 *    · 自动播放视频，2x 起；任务点不通过自动降速重播（2 → 1.5 → 1.25 → 1）
 *    · 自动答视频弹题（答错自动换选项，穷举到答对为止）
 *    · 自动切章节测验、答题、提交、确认、点下一节
 *    · 空章节 / 本节无测验 自动跳过
 *    · 切后台回来自动恢复，不会误判卡死
 *
 *  安装：
 *    1. 浏览器装 Tampermonkey（篡改猴）扩展
 *    2. 把本 .user.js 文件直接拖进浏览器窗口
 *    3. 在弹出页点「安装」，再 Ctrl+S 保存
 *    4. 打开学习通课程页，右上角出现「📚 刷课v55」即成功
 *
 *  说明：
 *    不需要 F12，不需要 Ctrl+F8。
 *    因为不开 DevTools，学习通的 debugger 注入会被浏览器直接忽略。
 *
 *  注意（重要）：
 *    · 视频内的弹题：答错可以重选，脚本会逐个尝试选项，最终能答对。
 *    · 章节测验 / 小节测验：只能提交一次，脚本为【随机作答】，
 *      正确率不保证。本脚本定位是"自动刷完课程"，不是"考满分"。
 *      如果这门课的测验分数影响成绩，请自己作答后再运行脚本。
 *
 *    · 视频需要看够总时长的 90% 才算完成任务点。
 *      脚本默认 2x，若该课程不通过会自动降到 1.5x / 1.25x / 1x 重播。
 *
 *  停止：
 *    刷新页面即可；或到 Tampermonkey 管理面板禁用本脚本。
 * ============================================================ */
(() => {
  'use strict';
  /* ===== v51: 多版本共存检测（避免 v49/v50/v51 同时跑）===== */
  if (window.__CX_AUTO_STUDY_V49__ || window.__CX_AUTO_STUDY_V50__ || window.__CX_AUTO_STUDY_V51__ || window.__CX_AUTO_STUDY_V52__ || window.__CX_AUTO_STUDY_V53__ || window.__CX_AUTO_STUDY_V54__ || window.__CX_AUTO_STUDY_V55__) {
    console.warn("[刷课v55] 检测到另一个版本已在本页运行，跳过重复注入");
    return;
  }
  window.__CX_AUTO_STUDY_V55__ = true;

  /* ===== v51: 启动横幅 —— 用来确认脚本到底注入了没有 ===== */
  console.log("%c[刷课v55] ✅ 脚本已注入", "color:#4caf50;font-weight:bold;font-size:14px");
  console.log("[刷课v55] 当前页面: " + location.href);
  console.log("[刷课v55] 油猴管理器: " + (typeof GM_info !== "undefined" && GM_info.scriptHandler ? GM_info.scriptHandler : "未知"));

  /* ===== v51: 排除考试/登录/成绩等无关页面 ===== */
  (function () {
    var u = String(location.href);
    var u2 = u.toLowerCase();
    var badUrls = ["exam-ans", "passport", "checkcode", "/exam/", "/exam?", "/test/", "/score", "/login", "/exam-"];
    var blocked = false;
    for (var bi = 0; bi < badUrls.length; bi++) {
      if (u2.indexOf(badUrls[bi]) >= 0) { blocked = true; break; }
    }
    if (blocked) {
      console.warn("[刷课v55] ⛔ 检测到考试/登录/成绩类页面，脚本不启动: " + u);
      window.__CX_AUTO_STUDY_V55_BLOCKED__ = true;
    }
  })();
  if (window.__CX_AUTO_STUDY_V55_BLOCKED__) return;

  /* ===== v51: 页面形状自检（帮他定位"为什么没反应"）===== */
  setTimeout(function () {
    try {
      var info = [];
      var vids = document.querySelectorAll("video").length;
      var tree = document.querySelector("#coursetree") ? "有" : "无";
      var tabbar = document.querySelector(".prev_list") ? "有" : "无";
      info.push("video 元素 " + vids + " 个");
      info.push("课程目录树 " + tree);
      info.push("tab 条 " + tabbar);
      console.log("[刷课v55] 页面自检: " + info.join(" | "));
      if (vids === 0 && tree === "无" && tabbar === "无") {
        console.warn("[刷课v55] ⚠ 这个页面不像课程学习页（没有 video / 目录树 / tab 条）。");
        console.warn("[刷课v55]   如果你确实在课程页，请确认页面已加载完成，然后刷新一次。");
      }
    } catch (e) {}
  }, 3000);


  /* ============ 配置 ============ */
  const CFG = {
    RATE: 2,
    RATE_STEPS: [2, 1.5, 1.25, 1],   /* v44: 自适应降速阶梯 */

    /* ===== v52: AI 答题（默认关，面板里开）===== */
    AI_ENABLED: false,
    AI_MODEL: "deepseek-chat",
    AI_BASE: "https://api.deepseek.com",
    AI_TIMEOUT_MS: 25000,
    AI_MAX_TOKENS: 12,
    AUTO_QUIZ: true,
    AUTO_NEXT: true,

    KEEPALIVE_MS: 500,
    MAIN_MS: 1200,

    DELAY_MIN: 500,
    DELAY_MAX: 2500,
    SUBMIT_COOLDOWN_MIN: 4000,
    CONTINUE_MIN: 1500,
    CONTINUE_MAX: 3500,

    DONE_WAIT_MIN: 2000,
    DONE_WAIT_MAX: 5000,

    ROLLBACK_TOLERANCE: 25,
    ROLLBACK_MAX_FIX: 3,
    QUIZ_SETTLE_MS: 3000,

    /* ⭐ 自救：无进展多久开始自救（不是停手！） */
    HEAL_AFTER: 20000,      // 20 秒无进展 → 开始自救
    HEAL_INTERVAL: 15000,   // 每 15 秒升一级
    HEAL_MAX_STAGE: 3,      // 最多自救 3 级，之后才停手
    STALL_TIMEOUT: 120000,  // 120 秒还救不回来 → 才停手
    STALL_CHECK: 5000,

  };

  const TAG = '[刷课v55]';
  const LOG = (m, c) => console.log('%c' + TAG + ' ' + m, 'color:' + (c || '#4caf50') + ';font-weight:bold');
  const WARN = (m) => console.warn(TAG + ' ' + m);

  const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
  const randDelay = () => randInt(CFG.DELAY_MIN, CFG.DELAY_MAX);

  /* ============ 工具 ============ */
  function findAll(root, pred, depth, out) {
    depth = depth || 0; out = out || [];
    if (depth > 8) return out;
    try {
      root.querySelectorAll('*').forEach(el => { if (pred(el)) out.push(el); });
      root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) findAll(el.shadowRoot, pred, depth + 1, out); });
      root.querySelectorAll('iframe').forEach(f => {
        try { if (f.contentDocument) findAll(f.contentDocument, pred, depth + 1, out); } catch (e) {}
      });
    } catch (e) {}
    return out;
  }
  function isVisible(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      return true;
    } catch (e) { return false; }
  }
  const txt = el => ((el && (el.innerText || el.textContent)) || '').trim();
  /** 文本归一化：去空白、去零宽字符 */
  const norm = s => (s || '').replace(/[\s\u200b-\u200f\uFEFF]/g, '');
  function byText(target, excludeFn) {
    const raw = findAll(document, el => {
      if (['A', 'BUTTON', 'DIV', 'SPAN', 'LI', 'LABEL', 'I', 'EM', 'P'].indexOf(el.tagName) < 0) return false;
      if (norm(txt(el)) !== norm(target)) return false;
      if (!isVisible(el)) return false;
      if (excludeFn && excludeFn(el)) return false;
      return true;
    });
    return raw.filter(el => !raw.some(o => o !== el && el.contains(o)))[0] || null;
  }

  /* ============ video ============ */
  /* ===== v50: 多视频页支持 =====
     学习通有些章节的视频页里会渲染两个 <video>（上下排列），
     任务点可能只挂在其中一个上。原来的实现永远返回第一个，
     导致"任务点未完成 → 降速重播 → 还是那一个 → 永远过不了"。
     现在改为：优先返回【还没播完】的那个，全部播完才返回第一个，
     这样两个视频会依次播完，再走小测/下一节。 */
  function findVideo() {
    var vids = findAll(document, function (el) {
      return el.tagName === "VIDEO" && el.duration > 0;
    });
    if (!vids.length) return null;
    if (vids.length === 1) { st.multiVidCount = 0; return vids[0]; }

    /* 多个视频：找第一个还没播完的 */
    for (var i = 0; i < vids.length; i++) {
      var x = vids[i];
      if (x.currentTime < x.duration - 3) {
        if (st.multiVidCount !== vids.length) {
          st.multiVidCount = vids.length;
          LOG("检测到 " + vids.length + " 个视频，逐个播完（当前第 " + (i + 1) + " 个）", "#ff9800");
        }
        return x;
      }
    }
    /* 全部播完 */
    if (st.multiVidCount) {
      st.multiVidCount = 0;
      LOG("多个视频已全部播完", "#4caf50");
    }
    return vids[0];
  }

  /* ===== v53: 可清理设计 ===== */
  var __CX_TIMERS = [];
  var __CX_ORIG = {
    hidden: Object.getOwnPropertyDescriptor(Document.prototype, "hidden") || null,
    visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState") || null,
    webkitHidden: Object.getOwnPropertyDescriptor(Document.prototype, "webkitHidden") || null,
    activeElement: Object.getOwnPropertyDescriptor(Document.prototype, "activeElement") || null,
    hasFocus: Document.prototype.hasFocus || null,
    playbackRate: null,
    currentTime: null
  };

  const mediaProto = HTMLMediaElement.prototype;
  const rateDesc = Object.getOwnPropertyDescriptor(mediaProto, 'playbackRate');
  const timeDesc = Object.getOwnPropertyDescriptor(mediaProto, 'currentTime');

  const st = {
    tried: new Set(),
    busy: false,
    continueClicked: false,
    videoDoneAt: 0,
    quizReady: false,
    quizSubmitted: 0,
    chapterCount: 0,
    maxTime: 0,
    rollbackFixes: 0,
    lastRollbackLog: 0,
    lastSubmitAt: 0,
    lastQuizSeenAt: 0,
    continueAt: 0,
    lastGoodTime: 0,          /* v35: 上一轮视频时间，用于判断视频是否真在前进 */
    busyAt: 0,              /* v39: busy 起始时刻，用于泄漏看门狗 */
    emptyAt: 0,             /* v41: 本页开始"无视频无播放按钮"的时刻，用于空章节判定 */
    quizTabMissingAt: 0,    /* v42: 发现"本小节无章节测验"的时刻 */
    pendingNext: 0,          /* v44: {fromId, at} 点了下一节待验证 */
    rateDrops: 0,            /* v44: 降速次数 */
    multiVidCount: 0,        /* v50: 当前页检测到的视频数量（>1 表示双视频页） */
    pendingReplay: 0,        /* v46: 降速后等 video 出现再重播 */
    hiddenAt: 0,             /* v47: 进入后台的时刻 */
    /* ⭐ 保险 */
    lastProgressAt: Date.now(),   // 上次"有实质进展"的时间
    lastProgressTime: 0,          // 上次记录的视频时间
    stalled: false,               // 是否已判定卡住
    stallCount: 0,
    endedAt: 0,                   // ⭐ v6 视频播完时刻（播完后保活静默）
    quizTabTried: 0,              // ⭐ v6 切 tab 尝试次数
    submitRetries: 0,
    answeredMap: {},
    noInputWarned: 0,
    dlgWarned: 0,
    subNoBtnWarned: 0,
    finishedAt: 0,
    answeredAll: 0,
  };

  /* ============ 弹题 ============ */
  const getQuizRadios = () =>
    findAll(document, el => el.tagName === 'INPUT' && el.name === 'ans-videoquiz-opt');

  /** ⭐ 已答对的标志：页面出现「恭喜你，答对了」 */
  function isAnsweredCorrect() {
    return findAll(document, el => {
      const t = norm(txt(el));
      return t.indexOf('恭喜你') >= 0 && t.indexOf('答对') >= 0 && t.length < 40;
    }).length > 0;
  }

  const getQuizLabels = () =>
    findAll(document, el => el.tagName === 'LABEL' && /^[A-D][、.]/.test(txt(el)));

  /** ⭐ 关键修复：按钮匹配改用 includes + 归一化 */
  function getQuizButtons() {
    const raw = findAll(document, el => {
      if (['A', 'BUTTON', 'DIV', 'SPAN', 'I', 'EM', 'P', 'LI'].indexOf(el.tagName) < 0) return false;
      if (el.classList && el.classList.contains('tkTopic_open')) return false;
      const t = norm(txt(el));
      if (t.length === 0 || t.length > 12) return false;
      if (t.indexOf('继续学习') < 0 && t.indexOf('提交') < 0) return false;
      if (!isVisible(el)) return false;
      return true;
    });
    const inner = raw.filter(el => !raw.some(o => o !== el && el.contains(o)));

    const isCont = e => norm(txt(e)).indexOf('继续学习') >= 0;
    const isSubmit = e => norm(txt(e)).indexOf('提交') >= 0 && norm(txt(e)).indexOf('继续学习') < 0;

    return {
      cont: inner.filter(isCont),
      submit: inner.filter(isSubmit),
      all: inner
    };
  }

  /** ⭐ 弹题是否还"在场"（更宽松，任何一样都算） */
  function hasVideoQuiz() {
    /* ===== v36: 视频在正常前进 → 弹题一定结束了，别再让残留按钮卡住 maxTime/回退 ===== */
    var __hv = (typeof findVideo === "function") ? findVideo() : null;
    if (__hv && __hv.duration > 0 && !__hv.paused && __hv.currentTime > 1 && __hv.currentTime < __hv.duration - 3) return false;
    if (getQuizRadios().length > 0) return true;
    const qb = getQuizButtons();
    if (qb.cont.length > 0) return true;
    if (qb.submit.length > 0) return true;
    if (isAnsweredCorrect()) return true;
    return false;
  }

  /* ============ 章节测验 ============ */
  /** v12: 统一走 collectQuestions，兼容旧调用点 */
  function getQuestions() { return collectQuestions(); }
  /* ===== v8: 一键诊断 ===== */
  /* ===== v8: 检查是否每题都选了 ===== */
  /* ===== v9: 更宽松地找"提交"按钮（不误伤） ===== */
  /* ===== v16: 严格匹配 + 排除弹窗 + class 优先 ===== */
  function findSubmitButton() {
    var dlg = findDialog();
    var EXACT = ["提交", "交卷", "确定", "确认提交", "保存并提交"];
    var cands = findAll(document, function (el) {
      if (["A", "BUTTON", "DIV", "SPAN", "INPUT"].indexOf(el.tagName) < 0) return false;
      if (!isVisible(el)) return false;
      if (dlg && dlg.contains(el)) return false;   // 排除弹窗内的
      var t = norm(txt(el)) || norm(el.value || "");
      if (t.length === 0 || t.length > 6) return false;
      for (var i = 0; i < EXACT.length; i++) {
        if (t === EXACT[i]) return true;           // 严格相等，不用 indexOf
      }
      return false;
    });
    if (!cands.length) return null;

    var inner = cands.filter(function (el) {
      return !cands.some(function (o) { return o !== el && el.contains(o); });
    });

    var scored = inner.map(function (el) {
      var c = (el.className || "") + "";
      var s = 0;
      if (/btnSubmit/i.test(c)) s += 30;
      if (/workBtnIndex/i.test(c)) s += 10;
      if (/submit/i.test(c)) s += 15;
      if (/bluebtn/i.test(c)) s += 8;
      if (/btn/i.test(c)) s += 5;
      if (el.tagName === "BUTTON" || el.tagName === "A") s += 3;
      return { el: el, s: s, cls: c };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    LOG("候选提交按钮 " + inner.length + " 个，最高分 " + scored[0].s + "（class=" + scored[0].cls.slice(0, 40) + "）");
    if (scored[0].s < 5) {
      WARN("最高分太低（" + scored[0].s + "），可能不是真提交按钮，但仍尝试");
    }
    return scored[0].el;
  }

  /* ===== v10: 按 input[name] 分组判定，不依赖题目容器 ===== */
  /* ===== v12: 双通道选项收集（input 优先，没有就走 DOM）===== */
  function collectQuestions() {
    var KEYS = ["questionLi", "TiMu", "question-item", "mark_item", "questionItem"];
    for (var ki = 0; ki < KEYS.length; ki++) {
      var k = KEYS[ki];
      var list = findAll(document, function (el) {
        if (!el.classList) return false;
        for (var ci = 0; ci < el.classList.length; ci++) {
          if (el.classList[ci].indexOf(k) >= 0) return true;
        }
        return false;
      });
      if (list.length >= 1) return list;
    }
    var cands = findAll(document, function (el) {
      if (!isVisible(el)) return false;
      var t = txt(el);
      if (!/^\d+\s*[【\[]/.test(t)) return false;
      if (t.length > 1500) return false;
      return true;
    });
    return cands.filter(function (el) {
      return !cands.some(function (o) { return o !== el && el.contains(o); });
    });
  }

  /** 在一道题里找所有可点选项 */
  function collectOptions(qEl) {
    var inputs = Array.prototype.slice.call(qEl.querySelectorAll("input[type=radio], input[type=checkbox]"));
    var labels = Array.prototype.slice.call(qEl.querySelectorAll("label")).filter(isVisible);
    var blocks = Array.prototype.slice.call(qEl.querySelectorAll("li, [class*=option], [class*=answer], [class*=choice], [class*=select]"))
      .filter(function (el) { return isVisible(el) && el.querySelectorAll("*").length <= 8; });
    if (!blocks.length) {
      blocks = findAll(qEl, function (el) {
        if (!isVisible(el)) return false;
        var t = txt(el);
        if (!/^[A-D]\s*[、.．:：)）]/.test(t)) return false;
        return el.querySelectorAll("*").length <= 5;
      });
    }
    return { inputs: inputs, labels: labels, blocks: blocks };
  }

  /** 点一个选项（尽量点 label/容器，别只设 checked） */
  function clickOption(el) {
    /* ===== v16: 先滚动到可视区再点 ===== */
    try { if (el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center" }); } catch (e) {}
    try { el.focus && el.focus(); } catch (e) {}
    if (!el) return false;
    try { el.click(); } catch (e) {}
    if (el.tagName === "INPUT") {
      var lb = null;
      if (el.id) {
        var lbs = document.querySelectorAll("label");
        for (var i = 0; i < lbs.length; i++) {
          if (lbs[i].htmlFor === el.id) { lb = lbs[i]; break; }
        }
      }
      if (!lb && el.closest) lb = el.closest("label");
      if (!lb && el.parentElement) lb = el.parentElement;
      if (lb) { try { lb.click(); } catch (e) {} }
      if (!el.checked) {
        el.checked = true;
        try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
    }
    return true;
  }

  /** v12: 检查每道题是否都选了 */
  /* ===== v13: 用"自己点过的指纹"判断，不依赖 DOM class ===== */
  /* ===== v13: 弹窗检测与点击（不限长度、不限标签）===== */
  function findDialog() {
    var cands = findAll(document, function (el) {
      if (!isVisible(el)) return false;
      var t = txt(el);
      if (t.length === 0 || t.length > 400) return false;
      /* v35: 排除进度说明文字，避免误判成弹窗 */
      if (t.indexOf("完成条件") >= 0) return false;
      if (t.indexOf("观看时长需") >= 0) return false;
      if (t.indexOf("总时长的") >= 0) return false;
      if (t.indexOf("当前视频不可拖拽") >= 0) return false;
      if (t.indexOf("页面最小化") >= 0) return false;
      if (t.indexOf("任务点前") >= 0) return false;
      return /确认提交|确定提交|未做完|未完成|是否提交|确认交卷/.test(t);
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return txt(a).length - txt(b).length; });
    return cands[0];
  }

  /* ===== v15: 从"确认提交？"文字往上爬，找到含按钮的容器 ===== */
  function clickDialogSubmit() {
    var textEl = findDialog();
    if (!textEl) return false;

    var BTN_TEXTS = ["提交", "确定", "确认", "是", "继续", "交卷"];
    var found = null;
    var dlg = textEl;
    for (var hop = 0; hop < 7 && dlg && dlg !== document.body; hop++) {
      var raw = Array.prototype.slice.call(dlg.querySelectorAll("a, button, div, span, input"));
      var btns = raw.filter(function (el) {
        if (!isVisible(el)) return false;
        var t = norm(txt(el)) || norm(el.value || "");
        if (t.length === 0 || t.length > 8) return false;
        for (var i = 0; i < BTN_TEXTS.length; i++) {
          if (t === BTN_TEXTS[i]) return true;
        }
        return false;
      });
      if (btns.length) {
        var inner = btns.filter(function (el) {
          return !btns.some(function (o) { return o !== el && el.contains(o); });
        });
        if (inner.length) { found = inner; break; }
      }
      dlg = dlg.parentElement;
    }

    if (!found || !found.length) {
      if (!st.dlgWarned) {
        st.dlgWarned = 1;
        WARN("弹窗存在但爬 7 层仍找不到按钮，弹窗文字：[" + txt(textEl).replace(/\s+/g, " ").slice(0, 80) + "]");
      }
      return false;
    }

    var best = null;
    for (var i2 = 0; i2 < found.length; i2++) {
      if (norm(txt(found[i2])) === "提交") { best = found[i2]; break; }
    }
    if (!best) best = found[0];
    clickOption(best);
    LOG("✅ 点了弹窗的「" + norm(txt(best)) + "」（爬 " + (hop) + " 层找到）");
    st.quizSubmitted = Date.now();
    st.dlgWarned = 0;
    st.quizReady = false;
    st.answeredAll = 0;
    st.answeredMap = {};
    return true;
  }

  function checkAllAnswered() {
    var qs = collectQuestions();
    if (!qs.length) return { ok: false, total: 0, totalInputs: 0, missing: [] };
    var missing = [];
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      var fp = norm(txt(q)).slice(0, 45);
      if (st.answeredMap[fp]) continue;
      var opts = collectOptions(q);
      var n = opts.inputs.length + opts.labels.length + opts.blocks.length;
      if (n === 0) { missing.push(i + 1); continue; }
      var has = false;
      for (var k = 0; k < opts.inputs.length; k++) {
        if (opts.inputs[k].checked) { has = true; break; }
      }
      if (!has) {
        var all = opts.labels.concat(opts.blocks);
        for (var j = 0; j < all.length; j++) {
          var cl = all[j].className || "";
          if (/checked|selected|active|current|(^|\s)cur(\s|$)|(^|\s)on(\s|$)/i.test(cl)) { has = true; break; }
        }
      }
      if (!has) missing.push(i + 1);
    }
    return { ok: missing.length === 0, total: qs.length, totalInputs: qs.length, missing: missing };
  }

  /** v12: 逐题随机作答（input 通道 + DOM 通道） */
  /* ===== v15: 逐题异步作答（每题 0.8~1.8 秒，像人在做）===== */
  /* ===== v53: 一键清除所有痕迹 ===== */
  function purgeAll() {
    var report = [];
    try {
      for (var ti = 0; ti < __CX_TIMERS.length; ti++) clearInterval(__CX_TIMERS[ti]);
      __CX_TIMERS.length = 0;
      report.push("定时器已停");
    } catch (e) {}

    try { localStorage.removeItem("cx_ai_key_v52"); report.push("AI Key 已删除"); } catch (e) {}

    try { delete window.__CX_AUTO_STUDY_V55__; report.push("全局标记已删"); } catch (e) {}
    try { delete window.__CX_AUTO_STUDY_V55_BLOCKED__; } catch (e) {}
    try { delete window.__cxSilent4; } catch (e) {}

    try {
      delete document.hidden;
      delete document.visibilityState;
      delete document.webkitHidden;
      delete document.activeElement;
      delete document.hasFocus;
      delete window.hasFocus;
      report.push("document 伪装已还原");
    } catch (e) {}

    try {
      var vids = document.querySelectorAll("video");
      for (var vi = 0; vi < vids.length; vi++) {
        try { delete vids[vi].playbackRate; } catch (e) {}
        try { delete vids[vi].currentTime; } catch (e) {}
      }
      report.push("video hook 已还原（" + vids.length + " 个）");
    } catch (e) {}

    try {
      var pp = document.getElementById("cx-panel");
      if (pp) { pp.remove(); report.push("面板已移除"); }
    } catch (e) {}

    try { st.answeredMap = {}; } catch (e) {}

    console.log("[刷课v55] 清理完成：" + report.join(" / "));
    console.log("[刷课v55] 建议立即刷新页面，彻底清除事件监听与运行时状态");
    try {
      alert("清理完成：\n" + report.join("\n") + "\n\n建议现在按 F5 刷新，彻底清除。");
    } catch (e) {}
  }

  /* ===== v52: AI 答题核心 ===== */
  var AI_KEY_STORE = "cx_ai_key_v52";

  function getAiKey() {
    try { return localStorage.getItem(AI_KEY_STORE) || ""; } catch (e) { return ""; }
  }

  function setAiKey(k) {
    try {
      if (k) localStorage.setItem(AI_KEY_STORE, k);
      else localStorage.removeItem(AI_KEY_STORE);
      return true;
    } catch (e) { return false; }
  }

  /* 把题干和选项丢给 DeepSeek，返回选项字母（A/B/C/D），失败返回 null */
  function askAI(qText, optTexts, isMulti) {
    return new Promise(function (resolve) {
      var key = getAiKey();
      if (!key) { resolve(null); return; }

      var n = optTexts.length;
      var letters = [];
      for (var bi = 0; bi < n; bi++) letters.push(String.fromCharCode(65 + bi));

      var sys = "你是课程测验答题助手。"
              + "单选题只输出一个字母（如 A）；"
              + "多选题输出全部正确选项的字母，连写不加任何分隔（如 ABD）。"
              + "不要解释、不要标点、不要空格、不要加粗。";
      var usr = "题型：" + (isMulti ? "多选题（可能有多个正确答案，请给出全部）" : "单选题（只有一个正确答案）") + "\n\n"
              + "题目：" + qText + "\n\n"
              + "选项：\n"
              + letters.map(function (L, i) { return L + ". " + optTexts[i]; }).join("\n")
              + "\n\n只输出字母（" + letters.join("/") + "）。"
              + (isMulti ? "\n注意：这是多选题，请输出所有正确选项，例如 ABD。" : "\n注意：这是单选题，只输出一个字母。");

      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; WARN("AI 请求超时 " + (CFG.AI_TIMEOUT_MS/1000) + "s，回落随机"); resolve(null); }
      }, CFG.AI_TIMEOUT_MS);

      fetch(CFG.AI_BASE + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key
        },
        body: JSON.stringify({
          model: CFG.AI_MODEL,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr }
          ],
          max_tokens: CFG.AI_MAX_TOKENS,
          temperature: 0
        })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        if (done) return;
        done = true; clearTimeout(timer);
        var content = "";
        try { content = j.choices[0].message.content || ""; } catch (e) {}
        content = String(content).toUpperCase();
        var m = content.match(/[A-Z]/g);
        if (!m || !m.length) { WARN("AI 返回无法解析: " + content); resolve(null); return; }
        /* 只保留合法范围内的字母 */
        var valid = "";
        for (var vi = 0; vi < m.length; vi++) {
          var code = m[vi].charCodeAt(0) - 65;
          if (code >= 0 && code < n && valid.indexOf(m[vi]) < 0) valid += m[vi];
        }
        if (!valid) { WARN("AI 返回的字母超出选项范围: " + content); resolve(null); return; }
        resolve(valid);
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(timer);
        WARN("AI 请求失败: " + (e && e.message ? e.message : e) + "，回落随机");
        resolve(null);
      });
    });
  }

  /* 测试 Key 是否可用 */
  function testAiKey() {
    return askAI("1+1等于几？", ["2", "3", "4", "5"]).then(function (r) {
      return r ? ("通了，模型回答 " + r) : "没通（Key 无效 / 无余额 / 网络问题）";
    });
  }

  function answerAllGroups(onDone) {
    var qs = collectQuestions();
    if (!qs.length) { WARN("没找到题目容器"); if (onDone) onDone(0, 0); return; }
    var i = 0;
    var done = 0;
    function step() {
      if (i >= qs.length) {
        LOG("本轮答了 " + done + " 题 / 共 " + qs.length + " 题");
        if (onDone) onDone(done, qs.length);
        return;
      }
      var q = qs[i];
      var gi = i;
      i++;
      var fp = norm(txt(q)).slice(0, 45);
      if (!st.answeredMap[fp]) {
        var opts = collectOptions(q);
        var pool = [];
        var chan = "";
        if (opts.labels.length) { pool = opts.labels; chan = "label"; }
        else if (opts.blocks.length) { pool = opts.blocks; chan = "容器"; }
        else if (opts.inputs.length) { pool = opts.inputs; chan = "input"; }
        if (pool.length) {
          /* ===== v52: 优先 AI 作答，失败/无 Key/超时 → 回落随机 ===== */
          var __qText = norm(txt(q)).slice(0, 400);
          var __optTexts = [];
          for (var oi = 0; oi < pool.length; oi++) {
            __optTexts.push(norm(txt(pool[oi])).slice(0, 100));
          }

          /* ===== v54: 先判断题型（checkbox = 多选）===== */
          var __isMulti = false;
          try {
            var __ins = q.querySelectorAll("input[type=radio], input[type=checkbox]");
            for (var __mi = 0; __mi < __ins.length; __mi++) {
              if (__ins[__mi].type === "checkbox") { __isMulti = true; break; }
            }
            if (!__isMulti && /多选|多项选择|不定项|选出所有|以下哪些|不止一个/.test(norm(txt(q)))) {
              __isMulti = true;
            }
          } catch (e) {}

          var __finish = function (aiLetters) {
            var picked = [];
            var isAI = false;

            /* 解析 AI 返回的多字母，如 "ABD" */
            if (aiLetters) {
              for (var li = 0; li < aiLetters.length; li++) {
                var ci = aiLetters.charCodeAt(li) - 65;
                if (ci >= 0 && ci < pool.length && picked.indexOf(ci) < 0) picked.push(ci);
              }
              if (picked.length) isAI = true;
            }

            /* 兜底随机 */
            if (!isAI) {
              if (__isMulti) {
                var total = pool.length;
                var cnt = total <= 2 ? 1 : (1 + Math.floor(Math.random() * (total - 1)));
                var idxs = [];
                for (var kk = 0; kk < total; kk++) idxs.push(kk);
                for (var ss = idxs.length - 1; ss > 0; ss--) {
                  var jj = Math.floor(Math.random() * (ss + 1));
                  var tt = idxs[ss]; idxs[ss] = idxs[jj]; idxs[jj] = tt;
                }
                picked = idxs.slice(0, cnt).sort(function (a, b) { return a - b; });
              } else {
                picked = [Math.floor(Math.random() * pool.length)];
              }
            }

            /* 单选却拿到多个 → 只留第一个 */
            if (!__isMulti && picked.length > 1) picked = [picked[0]];

            /* 逐个点击（已选中的跳过，避免 clickOption 内部 el.click+label.click 造成来回切换）*/
            for (var pi = 0; pi < picked.length; pi++) {
              var __el = pool[picked[pi]];
              var __inp = null;
              try {
                __inp = (__el.tagName === "INPUT") ? __el : __el.querySelector("input[type=radio], input[type=checkbox]");
              } catch (e) {}
              if (__inp && __inp.checked) continue;
              clickOption(__el);
            }

            st.answeredMap[fp] = 1;
            done++;
            var letterStr = picked.map(function (x) { return String.fromCharCode(65 + x); }).join("");
            LOG("第 " + (gi + 1) + " 题 → " + (isAI ? "AI 选 " : "随机选 ") + letterStr
                + "（" + (__isMulti ? "多选" : "单选") + " · 共 " + pool.length + " 项 · " + chan + "）",
                isAI ? "#9c27b0" : "#2196f3");
            setStatus("答题 " + (gi + 1) + "/" + qs.length + " 选 " + letterStr, isAI ? "#9c27b0" : "#2196f3");
            setTimeout(step, randInt(800, 1800));
          };

          if (CFG.AI_ENABLED && getAiKey()) {
            setStatus("AI 思考中 " + (gi + 1) + "/" + qs.length, "#9c27b0");
            askAI(__qText, __optTexts, __isMulti).then(__finish);
          } else {
            __finish(null);
          }
        } else {
          WARN("第 " + (gi + 1) + " 题找不到选项");
          setTimeout(step, randInt(800, 1800));
        }
      } else {
        setTimeout(step, randInt(800, 1800));
      }
    }
    step();
  }

  /* ===== v8: 检查是否每题都选了（按 checked 数量） ===== */
  function dumpQuizStructure() {
    var rpt = [];
    rpt.push("===== 诊断开始 =====");
    rpt.push("URL: " + location.href);

    var qs = getQuestions();
    rpt.push("A. 题目容器: " + qs.length);
    qs.forEach(function (q, i) {
      var t = txt(q).replace(/\s+/g, " ").slice(0, 45);
      var labels = q.querySelectorAll("label");
      var lis = q.querySelectorAll("li");
      var inputs = q.querySelectorAll("input[type=radio], input[type=checkbox]");
      var ck = 0;
      for (var k = 0; k < inputs.length; k++) if (inputs[k].checked) ck++;
      rpt.push("  [" + (i + 1) + "] label=" + labels.length + " li=" + lis.length + " input=" + inputs.length + " 已选=" + ck + " | " + t);
      for (var j = 0; j < labels.length && j < 6; j++) {
        rpt.push("      label[" + j + "]: " + txt(labels[j]).replace(/\s+/g, " ").slice(0, 30));
      }
    });

    var btns = findAll(document, function (el) {
      if (["A", "BUTTON", "DIV", "SPAN", "INPUT"].indexOf(el.tagName) < 0) return false;
      var t = norm(txt(el)) || norm(el.value || "");
      if (t.length === 0 || t.length > 12) return false;
      return t.indexOf("提交") >= 0 || t.indexOf("保存") >= 0 || t.indexOf("交卷") >= 0 || t.indexOf("下一节") >= 0;
    });
    rpt.push("B. 提交/保存/下一节: " + btns.length);
    btns.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      rpt.push("  [" + i + "] <" + el.tagName + "> text=[" + (txt(el) || el.value) + "] class=[" + (el.className || "") + "] inner=" + el.querySelectorAll("*").length + " 位置=" + Math.round(r.left) + "," + Math.round(r.top) + " 尺寸=" + Math.round(r.width) + "x" + Math.round(r.height));
    });

    var tabs = findAll(document, function (el) {
      if (["A", "LI", "DIV", "SPAN", "BUTTON"].indexOf(el.tagName) < 0) return false;
      var t = norm(txt(el));
      if (t.length === 0 || t.length > 15) return false;
      return t.indexOf("视频") >= 0 || t.indexOf("测验") >= 0 || t.indexOf("章节") >= 0;
    });
    rpt.push("C. tab: " + tabs.length);
    tabs.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      rpt.push("  [" + i + "] <" + el.tagName + "> [" + norm(txt(el)) + "] class=[" + (el.className || "") + "] 可见=" + (r.width > 0 && r.height > 0));
    });

    var dlgEls = findAll(document, function (el) {
      if (!isVisible(el)) return false;
      var t = txt(el);
      if (t.length > 200) return false;
      return t.indexOf("确认提交") >= 0 || t.indexOf("未做完") >= 0 || t.indexOf("未完成") >= 0;
    });
    rpt.push("E. 确认弹窗: " + dlgEls.length);
    dlgEls.forEach(function (el, i) {
      rpt.push("  [" + i + "] 文字=" + txt(el).replace(/\s+/g, " ").slice(0, 60));
    });
    rpt.push("D. iframe: " + document.querySelectorAll("iframe").length);
    rpt.push("===== 诊断结束 =====");
    var out = rpt.join(String.fromCharCode(10));
    console.log(out);
    try { copy(out); LOG("诊断已复制到剪贴板"); } catch (e) {}
    return out;
  }

  /* ===== v9: 弹窗提交按钮（加强版） ===== */
  function getConfirmSubmitBtn() {
    // 找弹窗容器：含"确认提交"/"未做完"/"未完成"且不太长
    var dialogs = findAll(document, function (el) {
      if (!isVisible(el)) return false;
      var t = txt(el);
      if (t.length > 200) return false;
      return (t.indexOf("确认提交") >= 0) || (t.indexOf("确定提交") >= 0) || (t.indexOf("未做完") >= 0) || (t.indexOf("未完成") >= 0);
    });
    if (!dialogs.length) return null;

    // 取最小的容器（最内层）
    dialogs.sort(function (a, b) {
      return txt(a).length - txt(b).length;
    });
    var dlg = dialogs[0];
    LOG("找到确认弹窗：" + txt(dlg).replace(/\s+/g, " ").slice(0, 40));

    // 在弹窗内找"提交/确定/确认"按钮
    var btns = Array.prototype.slice.call(dlg.querySelectorAll("A, BUTTON, DIV, SPAN, INPUT"))
      .filter(function (el) {
        if (!isVisible(el)) return false;
        var t = norm(txt(el)) || norm(el.value || "");
        if (t.length === 0 || t.length > 10) return false;
        return t.indexOf("提交") >= 0 || t.indexOf("确定") >= 0 || t.indexOf("确认") >= 0;
      });
    if (!btns.length) {
      WARN("弹窗存在但找不到提交按钮");
      return null;
    }
    // 去重取最内层
    var inner = btns.filter(function (el) {
      return !btns.some(function (o) { return o !== el && el.contains(o); });
    });
    LOG("弹窗内找到 " + inner.length + " 个按钮，点第一个：" + norm(txt(inner[0])));
    return inner[0] || null;
  }
  /** v6：找「章节测验」tab（多级降级 + 诊断）*/
  /* ===== v43: 只在页面顶部的 tab 条(.prev_list)里找「章节测验」—— 之前全局按文字搜索会点中目录侧边栏的「1.3 章节测验」节点 ===== */
  function __inTabBar(el) {
    var p = el, n = 0;
    while (p && n < 12) {
      try { if (p.classList && p.classList.contains("prev_list")) return true; } catch (e) {}
      p = p.parentElement; n++;
    }
    return false;
  }

  function __inCatalog(el) {
    var p = el, n = 0;
    while (p && n < 14) {
      try {
        var c = (p.className || "") + " " + (p.id || "");
        if (/catalog|chapter_?list|chapterList|directory|sidebar|side_?bar|right_?panel|menu_?list|nav_?list/i.test(c)) return true;
      } catch (e) {}
      p = p.parentElement; n++;
    }
    return false;
  }

  function findQuizTab() {
    var lv = ["章节测验", "测验", "题目", "练习"];
    var hasBar = false;
    try { hasBar = !!document.querySelector(".prev_list"); } catch (e) {}

    for (var li = 0; li < lv.length; li++) {
      var kw = lv[li];
      var cands = findAll(document, function (el) {
        if (["A", "LI", "DIV", "SPAN", "BUTTON", "P", "LABEL"].indexOf(el.tagName) < 0) return false;
        if (!isVisible(el)) return false;
        var t = norm(txt(el));
        if (t.length === 0 || t.length > 22) return false;
        if (t.indexOf(kw) < 0) return false;
        /* v43: 有 tab 条时只认 tab 条里的；没有时排除目录侧边栏 */
        if (hasBar) { if (!__inTabBar(el)) return false; }
        else { if (__inCatalog(el)) return false; }
        return true;
      });
      var inner = cands.filter(function (el) {
        return !cands.some(function (o) { return o !== el && el.contains(o); });
      });
      if (inner.length) return inner[0];
    }
    return null;
  }

  /** v6：找不到 tab 时打印页面上所有可能的 tab 文字 */
  function dumpTabs() {
    var list = findAll(document, function (el) {
      if (["A", "LI", "DIV", "SPAN", "BUTTON"].indexOf(el.tagName) < 0) return false;
      if (!isVisible(el)) return false;
      var t = txt(el);
      if (t.length === 0 || t.length > 25) return false;
      var r = el.getBoundingClientRect();
      if (r.height > 60) return false;
      return true;
    });
    var seen = {};
    var out = [];
    list.forEach(function (el) {
      var t = norm(txt(el));
      if (!t || seen[t]) return;
      seen[t] = 1;
      out.push(t);
    });
    WARN("页面可能的 tab 文字: " + out.slice(0, 20).join(" | "));
    return out;
  }

  function clickQuizTab() {
    var tab = findQuizTab();
    if (!tab) {
      st.quizTabTried = (st.quizTabTried || 0) + 1;
      if (st.quizTabTried <= 3) {
        WARN("第 " + st.quizTabTried + " 次没找到「章节测验」tab，诊断：");
        dumpTabs();
      }
      return false;
    }
    tab.click();
    LOG("点了「章节测验」tab: " + norm(txt(tab)));
    return true;
  }
  /* ===== v17: 检测测验是否已完成（已完成就别再找提交按钮了）===== */
  function isQuizFinished() {
    /* ===== v34: 页面上还有可见 video → 说明没播完，绝不算测验完成 ===== */
    var __v34 = findAll(document, function (e) { return e.tagName === "VIDEO" && isVisible(e); });
    if (__v34.length > 0) return false;

    /* ===== v37: 页面上还有可答的题目 → 一定没做完，绝不算完成 ===== */
    var __q37 = findAll(document, function (el) {
      if (el.tagName !== "INPUT") return false;
      var ty = (el.type || "").toLowerCase();
      if (ty !== "radio" && ty !== "checkbox") return false;
      if (!isVisible(el)) return false;
      return true;
    });
    if (__q37.length > 0) return false;

    /* ===== v37: 还有「提交 / 保存」按钮 → 还没交卷 ===== */
    var __sub37 = findAll(document, function (el) {
      if (["A", "BUTTON", "DIV", "SPAN", "INPUT"].indexOf(el.tagName) < 0) return false;
      if (!isVisible(el)) return false;
      var t = norm(txt(el));
      if (t.length === 0 || t.length > 10) return false;
      return t === "提交" || t === "交卷" || t === "暂时保存";
    });
    if (__sub37.length > 0) return false;

    var marks = findAll(document, function (el) {
      if (!isVisible(el)) return false;
      var t = norm(txt(el));
      if (t.length === 0 || t.length > 20) return false;
      /* v37: 去掉 t==="已完成"/"完成" 这种过宽匹配（会命中视频任务点标记） */
      if (t.indexOf("章节测验已完成") >= 0) return true;
      if (t.indexOf("测验已完成") >= 0) return true;
      if (/^\d+(\.\d+)?\s*分$/.test(t)) return true;
      return false;
    });
    return marks.length > 0;
  }

  /* ===== v17: 点「下一节」 ===== */
  function clickNextChapter() {
    var btns = findAll(document, function (el) {
      if (["A", "DIV", "SPAN", "BUTTON"].indexOf(el.tagName) < 0) return false;
      if (!isVisible(el)) return false;
      var t = norm(txt(el));
      if (t.length === 0 || t.length > 8) return false;
      return t === "下一节" || t === "下一章" || t === "下一小节";
    });
    if (!btns.length) { WARN("找不到「下一节」按钮"); return false; }
    var inner = btns.filter(function (el) {
      return !btns.some(function (o) { return o !== el && el.contains(o); });
    });
    /* ===== v41: 更严格地选「下一节」，排除"上一节"和 prev_next 这类共用 class ===== */
    inner = inner.filter(function (el) {
      var tt = norm(txt(el));
      return tt.indexOf("上") < 0;             /* 排除"上一节" */
    });
    if (!inner.length) { WARN("「下一节」候选被全部过滤（都含上）"); return false; }
    var best = inner[0];
    /* 优先 nextChapter，其次 class 含 next 但非 prev_ 开头 */
    for (var i = 0; i < inner.length; i++) {
      var c = (inner[i].className || "") + "";
      if (/nextChapter/i.test(c)) { best = inner[i]; break; }
    }
    if (!/nextChapter/i.test((best.className || "") + "")) {
      for (var i2 = 0; i2 < inner.length; i2++) {
        var c2 = (inner[i2].className || "") + "";
        if (/next/i.test(c2) && !/prev/i.test(c2)) { best = inner[i2]; break; }
      }
    }
    markNextClick();   /* v44: 点下一节前登记，4 秒后验证章节是否变了 */
    clickOption(best);
    LOG("✅ 点了「" + norm(txt(best)) + "」（class=" + ((best.className || "") + "").slice(0, 30) + "）");
    st.quizSubmitted = 0;
    st.quizReady = false;
    st.answeredAll = 0;
    st.answeredMap = {};
    st.chapterCount++;
    /* ===== v40: 换章节 = 一切状态归零（含 stalled 已放弃标志）===== */
    st.stalled = false; st.stallCount = 0;
    st.endedAt = 0; st.lastProgressTime = 0; lastProgressAtReset();
    st.finishedAt = 0; st.continueAt = 0;
    st.lastGoodTime = 0; st.continueClicked = false;
    st.lastSubmitAt = 0; st.lastQuizSeenAt = 0;
    st.busyAt = 0; st.noInputWarned = 0; st.subNoBtnWarned = 0; st.quizTabMissingAt = 0; st.quizTabTried = 0;   /* v42 */
    try { healReset(); } catch (e) {}
    st.videoDoneAt = 0;
    st.maxTime = 0;
    return true;
  }

  const isInQuizPage = () => !isQuizFinished() && (getQuestions().length >= 1 || !!byText('暂时保存'));

  /* ============ 状态框 ============ */
  const STATUS = { text: '启动中…', color: '#4caf50' };
  function setStatus(t, c) { STATUS.text = t; STATUS.color = c || '#4caf50'; refreshPanel(); }
  function ensurePanel() {
    if (document.getElementById('cx-panel')) return;
    const p = document.createElement('div');
    p.id = 'cx-panel';
    p.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
      'width:300px', 'padding:10px 12px', 'border-radius:10px',
      'background:rgba(18,20,26,.95)', 'color:#e6e6e6',
      'font:12px/1.62 "Microsoft YaHei",system-ui,sans-serif',
      'box-shadow:0 8px 28px rgba(0,0,0,.55)',
      'border:1px solid rgba(255,255,255,.13)', 'user-select:none'
    ].join(';');
    p.innerHTML =
      '<div id="cx-hd" style="display:flex;justify-content:space-between;margin-bottom:6px;cursor:move;">' +
        '<b style="color:#4c6ef5;font-size:13px;">📚 刷课v55</b>' +
        '<span id="cx-min" style="cursor:pointer;color:#999;padding:0 5px;">−</span></div>' +
      '<div id="cx-body">' +
        '<div><span style="color:#888;">状态 </span><span id="cx-st" style="color:#4caf50;">启动中…</span></div>' +
        '<div><span style="color:#888;">倍速 </span><span id="cx-rate">-</span></div>' +
        '<div><span style="color:#888;">试速 </span><span id="cx-rt" style="color:#ff9800;">-</span></div>' +
        '<div><span style="color:#888;">进度 </span><span id="cx-prog">-</span></div>' +
        '<div><span style="color:#888;">最远 </span><span id="cx-max" style="color:#64b5f6;">-</span></div>' +
        '<div><span style="color:#888;">修复 </span><span id="cx-fix" style="color:#ff9800;">0</span> 次</div>' +
        '<div><span style="color:#888;">已推进 </span><span id="cx-count" style="color:#ff9800;">0</span> 节</div>' +
        '<div><span style="color:#888;">冷却 </span><span id="cx-cd" style="color:#ce93d8;">-</span></div>' +
        '<div><span style="color:#888;">停滞 </span><span id="cx-stall" style="color:#9e9e9e;">-</span></div>' +
        '<div><span style="color:#888;">AI  </span><span id="cx-ai" style="color:#9e9e9e;">未启用</span></div>' +
        '<div style="margin-top:6px;display:flex;gap:6px;">' +
        '<span id="cx-ai-btn" style="flex:1;text-align:center;cursor:pointer;background:#9c27b0;color:#fff;padding:4px 0;border-radius:6px;font-size:11px;">🤖 AI 设置</span>' +
        '<span id="cx-diag" style="flex:1;text-align:center;cursor:pointer;background:#4c6ef5;color:#fff;padding:4px 0;border-radius:6px;font-size:11px;">🔍 诊断页面</span>' +
        '</div>' +
        '<div id="cx-purge" style="margin-top:4px;text-align:center;cursor:pointer;background:#455a64;color:#fff;padding:4px 0;border-radius:6px;font-size:11px;">🧹 清除所有痕迹</div>' +
        '<div id="cx-heal" style="color:#ce93d8;margin-top:3px;font-size:11px;"></div>' +
        '<div id="cx-alert" style="display:none;color:#f44336;font-weight:bold;margin-top:4px;"></div>' +
      '</div>';
    p.id = "cx-panel";   /* v53: 便于清理时移除 */
    document.body.appendChild(p);
    const minBtn = document.getElementById('cx-min'), body = document.getElementById('cx-body');
    setTimeout(function () {
      var dg = document.getElementById("cx-diag");
      if (dg) dg.onclick = function () { dumpQuizStructure(); };
      var aiBtn = document.getElementById("cx-ai-btn");
      if (aiBtn) aiBtn.onclick = function () {
        var cur = getAiKey();
        if (CFG.AI_ENABLED && cur) {
          if (confirm("AI 答题当前【已开启】。\n\n确定要关闭吗？\n（Key 会保留，可随时重新开启）")) {
            CFG.AI_ENABLED = false;
            LOG("AI 答题已关闭，章节测验改回随机", "#ff9800");
          }
          return;
        }
        var k = prompt("输入 DeepSeek API Key\n" +
                       "（在 platform.deepseek.com 创建，形如 sk-xxxxxxxx）\n\n" +
                       "当前: " + (cur ? (cur.slice(0, 10) + "...") : "未设置") + "\n" +
                       "留空并确定 = 清除 Key",
                       cur || "");
        if (k === null) return;
        k = k.trim();
        if (!k) {
          setAiKey("");
          CFG.AI_ENABLED = false;
          LOG("AI Key 已清除，AI 答题关闭");
          return;
        }
        setAiKey(k);
        CFG.AI_ENABLED = true;
        LOG("AI Key 已保存，正在测试连接...", "#9c27b0");
        testAiKey().then(function (msg) {
          var ok = msg.indexOf("通了") === 0;
          LOG("AI 测试结果: " + msg, ok ? "#4caf50" : "#f44336");
          if (!ok) {
            CFG.AI_ENABLED = false;
            WARN("AI 测试失败，已自动关闭 AI 答题（Key 已保留，可稍后重试）");
          }
        });
      };

      var purgeBtn = document.getElementById("cx-purge");
      if (purgeBtn) purgeBtn.onclick = function () {
        if (!confirm("将要清除：\n" +
                     "· AI Key（localStorage）\n" +
                     "· 脚本全局标记\n" +
                     "· document/video 上的伪装 hook\n" +
                     "· 面板本身\n\n" +
                     "清除后脚本立即停止运行（不可恢复，需刷新页面重新开始）。\n\n确定？")) return;
        purgeAll();
      };
    }, 300);
    let collapsed = false;
    if (minBtn) minBtn.onclick = () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : 'block';
      minBtn.textContent = collapsed ? '+' : '−';
    };

    /* ===== v48: 面板可拖动（小屏/不同分辨率下避免挡住视频控制条）===== */
    try {
      var hd = document.getElementById("cx-hd");
      if (hd) {
        var _drag = null;
        hd.addEventListener("mousedown", function (ev) {
          if (ev.target && ev.target.id === "cx-min") return;
          var r = p.getBoundingClientRect();
          p.style.left = r.left + "px";
          p.style.top = r.top + "px";
          p.style.right = "auto";
          p.style.bottom = "auto";
          _drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
          ev.preventDefault();
        });
        document.addEventListener("mousemove", function (ev) {
          if (!_drag) return;
          var nx = ev.clientX - _drag.dx;
          var ny = ev.clientY - _drag.dy;
          var maxX = Math.max(0, window.innerWidth - 60);
          var maxY = Math.max(0, window.innerHeight - 60);
          p.style.left = Math.min(Math.max(0, nx), maxX) + "px";
          p.style.top = Math.min(Math.max(0, ny), maxY) + "px";
        });
        document.addEventListener("mouseup", function () { _drag = null; });
      }
    } catch (e) {}
  }
  function refreshPanel() {
    const q = id => document.getElementById(id);
    const s = q('cx-st'), r = q('cx-rate'), g = q('cx-prog'), m = q('cx-max'),
          f = q('cx-fix'), c = q('cx-count'), cd = q('cx-cd'), sl = q('cx-stall'), al = q('cx-alert');
    if (s) { s.textContent = STATUS.text; s.style.color = STATUS.color; }
    if (r) r.textContent = CFG.RATE + 'x（对外 1x）';
    const rt = q("cx-rt");
    var aiEl = q("cx-ai");
    if (aiEl) {
      if (CFG.AI_ENABLED && getAiKey()) {
        aiEl.textContent = "已开启 · " + CFG.AI_MODEL;
        aiEl.style.color = "#ce93d8";
      } else if (getAiKey()) {
        aiEl.textContent = "已配置未启用";
        aiEl.style.color = "#ff9800";
      } else {
        aiEl.textContent = "未配置（随机答题）";
        aiEl.style.color = "#9e9e9e";
      }
    }
    if (rt) rt.textContent = (st.rateDrops ? ("降 " + st.rateDrops + " 次") : "未降速") + "  [" + (CFG.RATE_STEPS||[]).join("→") + "]";
    const v = findVideo();
    if (g) {
      if (v && v.duration > 0) {
        const pct = (v.currentTime / v.duration * 100).toFixed(0);
        g.textContent = (v.paused ? '⏸' : '▶') + ' ' + pct + '% ' +
          v.currentTime.toFixed(0) + '/' + v.duration.toFixed(0) + 's';
      } else g.textContent = '无视频';
    }
    if (m) m.textContent = st.maxTime.toFixed(0) + 's';
    if (f) f.textContent = String(st.rollbackFixes);
    if (c) c.textContent = String(st.chapterCount);
    if (cd) {
      if (st.lastSubmitAt) {
        const left = CFG.SUBMIT_COOLDOWN_MIN - (Date.now() - st.lastSubmitAt);
        cd.textContent = left > 0 ? (left / 1000).toFixed(1) + 's' : '就绪';
        cd.style.color = left > 0 ? '#ce93d8' : '#4caf50';
      } else cd.textContent = '-';
    }
    if (sl) {
      const idle = (Date.now() - st.lastProgressAt) / 1000;
      sl.textContent = idle.toFixed(0) + 's 无进展';
      sl.style.color = idle > 30 ? '#f44336' : (idle > 15 ? '#ff9800' : '#9e9e9e');
    }
    const hd = q('cx-heal');
    if (hd) {
      if (heal.logLines.length) {
        hd.innerHTML = '自救 L' + heal.stage + '：<br>' + heal.logLines.join('<br>');
      } else {
        hd.textContent = '自救：待命中';
      }
    }
    if (al) {
      if (st.stalled) {
        al.style.display = 'block';
        al.textContent = '⚠️ 自救无效已停手（' + CFG.STALL_TIMEOUT / 1000 + 's），请刷新页面';
      } else al.style.display = 'none';
    }
  }
  __CX_TIMERS.push(setInterval(refreshPanel, 700));

  /* ============ 接管 video ============ */
  function setupVideo(v) {
    if (!v || v.__cxReady) return;
    v.__cxReady = true;
    Object.defineProperty(v, 'playbackRate', {
      get() { return 1; },
      set() { rateDesc.set.call(v, CFG.RATE); },
      configurable: true
    });
    rateDesc.set.call(v, CFG.RATE);
    v.muted = true;
    LOG('video 已接管 ' + CFG.RATE + 'x');
  }

  /* ============ 反检测 ============ */
  if (!window.__cxSilent4) {
    window.__cxSilent4 = true;
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    } catch (e) {}
    try { document.hasFocus = () => true; window.hasFocus = () => true; } catch (e) {}
    try {
      Object.defineProperty(document, 'activeElement', {
        get: () => document.body || document.documentElement, configurable: true
      });
    } catch (e) {}
    ['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange',
     'blur', 'focusout', 'pagehide', 'mouseleave'].forEach(evt =>
      document.addEventListener(evt, e => e.stopImmediatePropagation(), true));
    ['blur', 'pagehide', 'mouseout'].forEach(evt =>
      window.addEventListener(evt, e => e.stopImmediatePropagation(), true));
    LOG('反检测已加固');
  }


  /* ============================================================
   *  ⭐⭐ 自我修复模块（v5 核心）
   * ============================================================ */
  const heal = {
    stage: 0,               // 当前自救等级 0~3
    lastHealAt: 0,
    rollbackHistory: [],    // 回退历史 {t, at}
    logLines: [],           // 自救日志（面板显示）
  };

  function healLog(msg) {
    const t = new Date().toTimeString().slice(0, 8);
    heal.logLines.push(t + ' ' + msg);
    if (heal.logLines.length > 4) heal.logLines.shift();
    LOG('🩹 ' + msg, '#ff9800');
    refreshPanel();
  }

  /** 记录一次回退（用于识别"同一时间点反复回退"） */
  function pushRollback(t) {
    heal.rollbackHistory.push({ t: Math.round(t), at: Date.now() });
    const cutoff = Date.now() - 300000;   // 只留 5 分钟
    heal.rollbackHistory = heal.rollbackHistory.filter(x => x.at > cutoff);
  }

  /** 是否"同一时间点反复回退"（±10 秒内 ≥3 次） */
  function isSameSpotLoop() {
    const recent = heal.rollbackHistory.filter(x => Date.now() - x.at < 180000);
    const groups = {};
    recent.forEach(x => {
      const key = Math.round(x.t / 10) * 10;
      groups[key] = (groups[key] || 0) + 1;
    });
    return Object.keys(groups).some(k => groups[k] >= 3);
  }

  /** 4 种方式猛点 */
  function baoLiClick(el) {
    /* ===== v14: 弹窗内的元素绝不暴力点击（会点掉弹窗）===== */
    var __dlg = findDialog();
    if (__dlg && __dlg.contains(el)) return false;
    if (!el) return false;
    let ok = false;
    try { el.click(); ok = true; } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); ok = true; } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); ok = true; } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); ok = true; } catch (e) {}
    try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window })); ok = true; } catch (e) {}
    try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window })); ok = true; } catch (e) {}
    try { if (el.parentElement && el.parentElement !== document.body) el.parentElement.click(); ok = true; } catch (e) {}
    return ok;
  }

  /** L1：暴力重新点所有候选按钮 */
  function healLevel1() {
    /* ===== v14: 有弹窗时绝不点任何东西（否则会把弹窗点掉）===== */
    if (findDialog()) { WARN("检测到弹窗，跳过后自救（避免点掉弹窗）"); return false; }
    const qb = getQuizButtons();
    const cands = [];
    qb.cont.forEach(e => cands.push(e));
    qb.submit.forEach(e => cands.push(e));
    qb.all.forEach(e => { if (cands.indexOf(e) < 0) cands.push(e); });

    // 兜底：按文字模糊找
    const extra = findAll(document, el => {
      if (['A', 'BUTTON', 'DIV', 'SPAN', 'I'].indexOf(el.tagName) < 0) return false;
      const t = norm(txt(el));
      if (t.length === 0 || t.length > 12) return false;
      if (t.indexOf('继续') < 0 && t.indexOf('提交') < 0 && t.indexOf('确定') < 0 && t.indexOf('播放') < 0 && t.indexOf('开始') < 0) return false;   /* v38 */
      return isVisible(el);
    });
    extra.forEach(e => { if (cands.indexOf(e) < 0) cands.push(e); });

    if (!cands.length) { healLog('L1 没有可点按钮'); return false; }
    cands.forEach(el => baoLiClick(el));
    healLog('L1 baoLiClick ' + cands.length + ' 个元素');
    return true;
  }

  /** L2：强制恢复视频状态 + 猛点一次 */
  function healLevel2() {
    if (findDialog()) { WARN('检测到弹窗，跳过 healLevel2'); return false; }
    const v = findVideo();
    if (!v) { healLog('L2 没有视频'); return false; }
    try {
      if (st.maxTime > 0) timeDesc.set.call(v, st.maxTime);
      rateDesc.set.call(v, CFG.RATE);
      v.muted = true;
      if (v.currentTime < v.duration - 3) v.play().catch(() => {});
    } catch (e) {}
    // 同时再猛点一次所有按钮
    const qb = getQuizButtons();
    [...qb.cont, ...qb.submit].forEach(el => baoLiClick(el));
    healLog('L2 强制播放 + 拉回 ' + st.maxTime.toFixed(0) + 's');
    return true;
  }

  /** L3：干掉弹题遮罩层 */
  function healLevel3() {
    if (findDialog()) { WARN('检测到弹窗，跳过 healLevel3'); return false; }
    const radios = getQuizRadios();
    let hiddenCount = 0;

    // 从 radio 往上找容器，隐藏 5 层
    if (radios.length) {
      let cur = radios[0];
      for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
        cur = cur.parentElement;
      }
      let box = radios[0].closest('div[class*="videoquiz"], div[class*="tkTopic"], div[class*="ans-"]') || radios[0].parentElement;
      let hop = box;
      for (let i = 0; i < 5 && hop && hop !== document.body; i++) {
        try {
          hop.style.display = 'none';
          hiddenCount++;
        } catch (e) {}
        hop = hop.parentElement;
      }
    }

    // 兜底：找所有含"恭喜你"/"继续学习"的块，隐藏
    const blocks = findAll(document, el => {
      const t = txt(el);
      if (t.length > 200) return false;
      return (t.indexOf('继续学习') >= 0 || t.indexOf('答对了') >= 0) && isVisible(el);
    });
    blocks.forEach(el => {
      let hop = el;
      for (let i = 0; i < 3 && hop && hop !== document.body; i++) {
        try { hop.style.display = 'none'; hiddenCount++; } catch (e) {}
        hop = hop.parentElement;
      }
    });

    // 强制播放
    const v = findVideo();
    if (v) {
      try {
        if (st.maxTime > 0) timeDesc.set.call(v, st.maxTime);
        v.muted = true;
        if (v.currentTime < v.duration - 3) v.play().catch(() => {});
      } catch (e) {}
    }
    healLog('L3 隐藏 ' + hiddenCount + ' 个遮罩层 + 强制播放');
    return true;
  }

  /** 执行一级自救 */
  function doHeal() {
    const t = Date.now();
    if (t - heal.lastHealAt < CFG.HEAL_INTERVAL) return;
    heal.lastHealAt = t;
    heal.stage++;

    if (heal.stage === 1) { healLevel1(); }
    else if (heal.stage === 2) { healLevel2(); }
    else if (heal.stage === 3) { healLevel3(); }
    else {
      healLog('自救已达上限，停手');
      st.stalled = true;
      setStatus('自救失败，已停手', '#f44336');
    }
  }

  /** 有进展时重置自救等级 */
  /** v40: 换章节时把"上次有进展时刻"归到现在 */
  function lastProgressAtReset() { st.lastProgressAt = Date.now(); }

  /* ===== v44: 取当前章节 id，用来判断"点下一节有没有真的推进" ===== */
  function getChapterId() {
    try {
      var m = String(location.href).match(/[?&]chapterId=(\d+)/);
      if (m) return m[1];
      var w = window.top;
      if (w && w !== window) {
        var m2 = String(w.location.href).match(/[?&]chapterId=(\d+)/);
        if (m2) return m2[1];
      }
    } catch (e) {}
    return "";
  }

  /* ===== v44: 点下一节前登记，4 秒后验证章节是否真的变了 ===== */
  function markNextClick() {
    st.pendingNext = { fromId: getChapterId(), at: Date.now() };
  }

  /* ===== v44: 降速一档并从头重播当前视频 ===== */
  function rateDown() {
    var steps = CFG.RATE_STEPS || [2, 1.5, 1.25, 1];
    var idx = steps.indexOf(CFG.RATE);
    if (idx < 0) {
      for (var q = 0; q < steps.length; q++) { if (steps[q] <= CFG.RATE) { idx = q; break; } }
      if (idx < 0) idx = 0;
    }
    if (idx >= steps.length - 1) {
      WARN("已降到 " + CFG.RATE + "x 仍不能通过任务点，请手动处理");
      setStatus(CFG.RATE + "x 仍不通过，请手动", "#f44336");
      return false;
    }
    var oldRate = CFG.RATE;
    CFG.RATE = steps[idx + 1];
    st.rateDrops = (st.rateDrops || 0) + 1;
    LOG("⚠ " + oldRate + "x 未通过任务点 → 降速到 " + CFG.RATE + "x，从头重播本节", "#ff9800");
    var v = findVideo();
    if (v) {
      try {
        rateDesc.set.call(v, CFG.RATE);
        v.muted = true;
        timeDesc.set.call(v, 0);
        v.currentTime = 0;
        v.play().catch(function () {});
      } catch (e) {}
    }
    st.maxTime = 0; st.rollbackFixes = 0; st.videoDoneAt = 0;
    st.quizReady = false; st.endedAt = 0; st.lastProgressTime = 0;
    st.lastProgressAt = Date.now(); st.stalled = false; st.stallCount = 0;
    st.pendingNext = 0;
    try { healReset(); } catch (e) {}
    if (v) { setStatus("降速到 " + CFG.RATE + "x，从头重播", "#ff9800"); st.pendingReplay = 0; } else { setStatus("降速到 " + CFG.RATE + "x，等视频出现后重播", "#ff9800"); st.pendingReplay = { at: Date.now() }; LOG("降速后暂未找到 video，已挂起，等它出现再重播"); }
    return true;
  }

  function healReset() {
    if (heal.stage !== 0) {
      healLog('✅ 已恢复，自救等级归零');
      heal.stage = 0;
      heal.lastHealAt = 0;
      heal.rollbackHistory = [];
    }
  }
  /* ============================================================
   *  ⭐ 停滞检测（保险）
   * ============================================================ */
  __CX_TIMERS.push(setInterval(() => {
    try {
      if (st.stalled) return;

      /* ===== v13: 弹窗最高优先 ===== */
      if (!st.busy && clickDialogSubmit()) { return; }

      /* ===== v17: 测验已完成 → 直接点下一节 ===== */
      if (isQuizFinished() && !st.busy) {
        if (!st.finishedAt) {
          st.finishedAt = Date.now();
          LOG("✅ 检测到测验已完成，准备点下一节");
          setStatus("测验已完成", "#4caf50");
        }
        if (Date.now() - st.finishedAt > 2000) {
          st.busy = true;
          var dn = randDelay();
          setStatus("等 " + (dn / 1000).toFixed(2) + "s 点下一节", "#ff9800");
          setTimeout(function () {
            clickNextChapter();
            st.finishedAt = 0;
            st.busy = false;
          }, dn);
          return;
        }
        return;
      }
      if (!isQuizFinished()) st.finishedAt = 0;
      const v = findVideo();
      // 判定"有进展"：视频时间明显前进，或换了章节
      if (v && v.duration > 0) {
        if (v.currentTime > st.lastProgressTime + 5 || v.currentTime < st.lastProgressTime - 200) {
          st.lastProgressTime = v.currentTime;
          st.lastProgressAt = Date.now();
          st.stallCount = 0;
          return;
        }
      }
      // 没有视频时，如果有章节测验在推进也算进展
      if (!v && st.quizSubmitted && Date.now() - st.quizSubmitted < CFG.STALL_TIMEOUT) {
        st.lastProgressAt = Date.now();
        return;
      }
      const idle = Date.now() - st.lastProgressAt;
      if (st.hiddenAt) return;   /* v47: 后台不判停滞，避免切回来瞬间变红 */

      /* ⭐ 分两级：先自救，实在救不回来才停手 */
      if (idle > CFG.HEAL_AFTER && !st.stalled) {
        const sameLoop = isSameSpotLoop();
        if (sameLoop && heal.stage === 0) {
          healLog('检测到同一时间点反复回退');
        }
        if (heal.stage < CFG.HEAL_MAX_STAGE) {
          if (st.lastProgressAt > 0) doHeal();
        } else if (idle > CFG.STALL_TIMEOUT) {
          // L3 用完还救不回来 → 真停手
          st.stalled = true;
          st.stallCount++;
          WARN('❌ ' + (CFG.STALL_TIMEOUT / 1000) + 's 无进展且自救无效，已停手');
          setStatus('自救无效，已停手', '#f44336');
        }
      }

      /* 恢复后归零 */
      if (idle < 3000 && heal.stage > 0) healReset();
    } catch (e) {}
  }, CFG.STALL_CHECK));

  /* ============================================================
   *  保活循环
   * ============================================================ */
  __CX_TIMERS.push(setInterval(() => {
    try {
      const v = findVideo();
      if (!v) return;
      setupVideo(v);

      /* ===== v46: 降速后挂起的重播，等 video 真出现再执行 ===== */
      if (st.pendingReplay) {
        if (Date.now() - st.pendingReplay.at > 30000) {
          WARN("等 video 重播超时 30 秒，放弃");
          st.pendingReplay = 0;
        } else if (v.duration > 0) {
          try {
            rateDesc.set.call(v, CFG.RATE);
            v.muted = true;
            v.currentTime = 0;
            v.play().catch(function () {});
            LOG("video 已就绪 → 按 " + CFG.RATE + "x 从头重播", "#ff9800");
          } catch (e) {}
          st.pendingReplay = 0;
          st.maxTime = 0; st.videoDoneAt = 0; st.quizReady = false;
          st.lastProgressAt = Date.now(); st.stalled = false; st.stallCount = 0;
        }
      }
      if (rateDesc.get.call(v) !== CFG.RATE) rateDesc.set.call(v, CFG.RATE);
      if (!v.muted) v.muted = true;

      /* ===== v36: 点过「继续学习」3 秒后视频还没恢复 → 强制切回播放状态 ===== */
      if (st.continueAt && Date.now() - st.continueAt > 3000 && v.paused && v.currentTime < v.duration - 3) {
        LOG("继续学习 " + ((Date.now() - st.continueAt) / 1000).toFixed(1) + "s 未恢复 → 强制播放");
        try { v.play().catch(function () {}); } catch (e) {}
        try {
          var __r = v.getBoundingClientRect();
          if (__r.width > 0) {
            ["mousedown", "mouseup", "click"].forEach(function (tp) {
              v.dispatchEvent(new MouseEvent(tp, { bubbles: true, cancelable: true, view: window,
                clientX: __r.left + __r.width / 2, clientY: __r.top + __r.height / 2 }));
            });
          }
        } catch (e) {}
        st.continueAt = 0;
        st.continueClicked = false;
        st.lastGoodTime = v.currentTime;
      }

      const quizNow = hasVideoQuiz();
      if (quizNow) st.lastQuizSeenAt = Date.now();

      // ===== v6：视频已播完 → 保活循环完全静默（不 play、不拉回、不记录）=====
      const isEnded = v.duration > 0 && v.currentTime >= v.duration - 1.5;
      if (isEnded) {
        if (!st.endedAt) {
          st.endedAt = Date.now();
          LOG('视频已播完，保活静默（避免重播）', '#2196f3');
        }
        return;
      }
      if (st.endedAt && v.currentTime < v.duration - 3) st.endedAt = 0;

      // ⭐ 弹题在场时：绝不记录最远、绝不拉回
      if (quizNow) {
        // 保持暂停，什么都不做
      } else {
        if (!v.paused && v.currentTime > st.maxTime) st.maxTime = v.currentTime;

        const settled = Date.now() - st.lastQuizSeenAt > CFG.QUIZ_SETTLE_MS;
        if (settled) {
          const back = st.maxTime - v.currentTime;
          if (back > CFG.ROLLBACK_TOLERANCE) {
            const t = Date.now();
            if (t - st.lastRollbackLog > 3000) {
              st.lastRollbackLog = t;
              WARN('回退 ' + back.toFixed(0) + 's（' + v.currentTime.toFixed(0) +
                '→' + st.maxTime.toFixed(0) + '）拉回');
            }
            if (st.rollbackFixes < CFG.ROLLBACK_MAX_FIX) {
            pushRollback(v.currentTime);   // ⭐ 记录回退历史
              st.rollbackFixes++;
              try { timeDesc.set.call(v, st.maxTime); } catch (e) {}
              if (v.paused && v.currentTime < v.duration - 3) v.play().catch(() => {});
            } else if (t - st.lastRollbackLog > 6000) {
              st.rollbackFixes = 0;
              st.maxTime = v.currentTime;
            }
          } else if (back < 3) {
            if (Date.now() - st.lastQuizSeenAt > 8000) st.rollbackFixes = 0;
          }
        }

        if (v.paused && v.currentTime < v.duration - 3) v.play().catch(() => {});
      }

      const r = v.getBoundingClientRect();
      if (r.width > 0) {
        const o = {
          bubbles: true, cancelable: true, view: window,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
        };
        v.dispatchEvent(new MouseEvent('mousemove', o));
        v.dispatchEvent(new MouseEvent('mouseover', o));
        document.dispatchEvent(new MouseEvent('mousemove', o));
        window.dispatchEvent(new Event('focus'));
      }
    } catch (e) {}
  }, CFG.KEEPALIVE_MS));

  /* ============================================================
   *  业务循环
   * ============================================================ */
  __CX_TIMERS.push(setInterval(() => {
    try {
      /* ===== v45: 「当前章节还有任务点未完成，是否去完成？」弹窗 → 点「去学习」回视频 + 降速重播 ===== */
      if (!st.busy) {
        var __taskDlg = findAll(document, function (el) {
          if (!isVisible(el)) return false;
          var t = norm(txt(el));
          if (t.length < 8 || t.length > 160) return false;
          return t.indexOf("当前章节还有任务点未完成") >= 0
              || (t.indexOf("任务点未完成") >= 0 && t.indexOf("是否去完成") >= 0);
        });
        if (__taskDlg.length > 0) {
          var __goBtn = findAll(document, function (el) {
            if (["A", "BUTTON", "SPAN", "DIV"].indexOf(el.tagName) < 0) return false;
            if (!isVisible(el)) return false;
            var t = norm(txt(el));
            if (t.length === 0 || t.length > 6) return false;
            return t === "去学习" || t === "去完成" || t === "去观看";
          });
          if (__goBtn.length > 0) {
            st.busy = true; st.busyAt = Date.now();
            st.pendingNext = 0;
            setStatus("任务点未完成 → 点「去学习」返回视频", "#ff9800");
            setTimeout(function () {
              try {
                baoLiClick(__goBtn[0]);
                LOG("检测到「任务点未完成」弹窗 → 点了「去学习」返回视频", "#ff9800");
              } catch (e) {}
              setTimeout(function () {
                st.busy = false; st.busyAt = 0;
                if (!rateDown()) { st.stalled = true; }
              }, 1500);
            }, randDelay());
            return;
          }
          /* 找不到「去学习」→ 先关掉弹窗，避免死锁 */
          var __closeBtn = findAll(document, function (el) {
            if (!isVisible(el)) return false;
            var t = norm(txt(el));
            return t === "×" || t === "✕" || t === "关闭" || t === "取消";
          });
          if (__closeBtn.length > 0) {
            st.busy = true; st.busyAt = Date.now();
            try { baoLiClick(__closeBtn[0]); } catch (e) {}
            LOG("任务点弹窗没找到「去学习」→ 关掉了弹窗", "#ff9800");
            setTimeout(function () { st.busy = false; st.busyAt = 0; }, 800);
            return;
          }
        }
      }

      /* ===== v46: 业务循环侧的重播保障（保活循环里 if (!v) return 会早退）===== */
      if (st.pendingReplay) {
        var __rv46 = findVideo();
        if (__rv46 && __rv46.duration > 0 && Date.now() - st.pendingReplay.at < 30000) {
          try {
            rateDesc.set.call(__rv46, CFG.RATE);
            __rv46.muted = true;
            __rv46.currentTime = 0;
            __rv46.play().catch(function () {});
            LOG("video 已就绪 → 按 " + CFG.RATE + "x 从头重播（业务循环）", "#ff9800");
          } catch (e) {}
          st.pendingReplay = 0;
          st.maxTime = 0; st.videoDoneAt = 0; st.quizReady = false;
          st.lastProgressAt = Date.now(); st.stalled = false; st.stallCount = 0;
          return;
        }
      }

      /* ===== v40: busy 泄漏看门狗（任何分支忘了复位都不会永久卡死）===== */
      if (st.busy && st.busyAt && Date.now() - st.busyAt > 20000) {
        WARN("busy 已 " + ((Date.now() - st.busyAt) / 1000).toFixed(0) + "s → 强制解除");
        st.busy = false; st.busyAt = 0;
      }

      /* ===== v39: 无 video → 点播放按钮。必须在 stalled 检查之前，否则换章节后救不回来 ===== */
      var __v39 = findVideo();
      if (!__v39 && !st.busy) {
        var __bp39 = findAll(document, function (el) {
          if (!isVisible(el)) return false;
          try { if (el.classList && el.classList.contains("vjs-big-play-button")) return true; } catch (e) {}
          var t39 = norm(txt(el));
          if (t39 === "播放视频" || t39 === "开始学习" || t39 === "点击开始" || t39 === "点击播放") return true;
          return false;
        });
        if (__bp39.length > 0) {
          /* 优先选真正的 BUTTON */
          var __pick = __bp39[0];
          for (var __j = 0; __j < __bp39.length; __j++) {
            if (__bp39[__j].tagName === "BUTTON") { __pick = __bp39[__j]; break; }
          }
          st.busy = true;
          st.busyAt = Date.now();
          var __d39 = randDelay();
          setStatus("等 " + (__d39 / 1000).toFixed(2) + "s 点播放按钮", "#2196f3");
          setTimeout(function () {
            try { baoLiClick(__pick); LOG("点了大播放按钮（" + __pick.tagName + "），等播放器创建 video"); } catch (e) {}
            /* 再补一次坐标点击 */
            try {
              var __r39 = __pick.getBoundingClientRect();
              if (__r39.width > 0) {
                var __tgt = document.elementFromPoint(__r39.left + __r39.width / 2, __r39.top + __r39.height / 2);
                if (__tgt && __tgt !== __pick) { baoLiClick(__tgt); }
              }
            } catch (e) {}
            st.busy = false;
            st.busyAt = 0;
          }, __d39);
          return;
        }
      }
      /* ===== v41: 空章节直通 —— 没 video / 没播放按钮 / 等 8s 仍如此 / 没题目没提交 → 点下一节 ===== */
      if (!__v39 && !st.busy) {
        var __bp41 = findAll(document, function (el) {
          if (!isVisible(el)) return false;
          try { if (el.classList && el.classList.contains("vjs-big-play-button")) return true; } catch (e) {}
          var t41 = norm(txt(el));
          return t41 === "播放视频" || t41 === "开始学习" || t41 === "点击开始" || t41 === "点击播放";
        });
        if (__bp41.length === 0) {
          if (!st.emptyAt) st.emptyAt = Date.now();
          if (Date.now() - st.emptyAt > 8000) {
            var __hasQ41 = getQuizRadios().length > 0 || getQuizButtons().submit.length > 0;
            var __hasSub41 = findAll(document, function (el) {
              if (!isVisible(el)) return false;
              var t = norm(txt(el));
              return t === "提交" || t === "交卷" || t === "暂时保存";
            }).length > 0;
            if (!__hasQ41 && !__hasSub41) {
              var __nx41 = findAll(document, function (el) {
                if (["A", "DIV", "SPAN", "BUTTON"].indexOf(el.tagName) < 0) return false;
                if (!isVisible(el)) return false;
                var t = norm(txt(el));
                if (t.length === 0 || t.length > 8) return false;
                if (t.indexOf("上") >= 0) return false;
                return /^(下一节|下一小节|下一章|下一个章节)$/.test(t);
              });
              if (__nx41.length > 0) {
                st.busy = true; st.busyAt = Date.now();
                var __d41 = randDelay();
                setStatus("空章节，等 " + (__d41 / 1000).toFixed(2) + "s 点下一节", "#ff9800");
                setTimeout(function () {
                  try {
                    var __tgt41 = __nx41[0];
                    for (var __k41 = 0; __k41 < __nx41.length; __k41++) {
                      var __c41 = (__nx41[__k41].className || "") + "";
                      if (/nextChapter/i.test(__c41)) { __tgt41 = __nx41[__k41]; break; }
                    }
                    markNextClick();   /* v44 */
                    baoLiClick(__tgt41);
                    LOG("空章节跳过：" + norm(txt(__tgt41)));
                    st.emptyAt = 0;
                    st.chapterCount++;
                    st.stalled = false; st.stallCount = 0;
                    st.lastProgressAt = Date.now();
                    st.maxTime = 0; st.videoDoneAt = 0; st.endedAt = 0;
                  } catch (e) {}
                  st.busy = false; st.busyAt = 0;
                }, __d41);
                return;
              }
            }
            st.emptyAt = 0;
          }
        } else {
          st.emptyAt = 0;
        }
      } else {
        st.emptyAt = 0;
      }
      /* ===== v44: 点过下一节 → 4 秒后验证章节真的推进了没 ===== */
      if (st.pendingNext && Date.now() - st.pendingNext.at > 4000) {
        var __nowId = getChapterId();
        var __fromId = st.pendingNext.fromId || "";
        st.pendingNext = 0;
        if (__nowId && __fromId && __nowId === __fromId) {
          WARN("点了下一节但章节没变（" + __fromId + "）→ 任务点未完成");
          st.quizSubmitted = 0; st.quizReady = false;
          if (!rateDown()) { st.stalled = true; }
          return;
        } else if (__nowId && __fromId && __nowId !== __fromId) {
          LOG("章节已推进：" + __fromId + " → " + __nowId + "（" + CFG.RATE + "x 通过）");
          st.rateDrops = 0;
        }
      }

      if (st.stalled) return;   // ⭐ 保险触发后停手

      const v = findVideo();
      const qb = getQuizButtons();
      const radios = getQuizRadios();
      const answered = isAnsweredCorrect();


      /* ---------- ① 已答对（有继续学习 / 或显示恭喜你答对了） ---------- */
      const shouldContinue = qb.cont.length > 0 || (answered && qb.all.length > 0);

      if (shouldContinue) {
        /* ===== v35: 视频已经在正常前进 → 弹题真的结束了，忽略残留的「继续学习」按钮 ===== */
        if (v && v.duration > 0 && !v.paused && v.currentTime < v.duration - 3) {
          if (v.currentTime > (st.lastGoodTime || 0) + 0.2) {
            st.lastGoodTime = v.currentTime;
            if (st.continueClicked) {
              LOG("视频已恢复 " + Math.round(v.currentTime) + "s，忽略残留的继续学习按钮");
              st.continueClicked = false;
              st.continueAt = 0;
            }
            setStatus("播放中 " + Math.round(v.currentTime) + "s / " + Math.round(v.duration) + "s", "#4caf50");   /* v36 */
            return;
          }
        }
        st.lastGoodTime = v ? v.currentTime : 0;
        st.lastQuizSeenAt = Date.now();

        const sinceSubmit = st.lastSubmitAt ? Date.now() - st.lastSubmitAt : 999999;
        if (sinceSubmit < CFG.SUBMIT_COOLDOWN_MIN) {
          setStatus('等提交生效 ' + ((CFG.SUBMIT_COOLDOWN_MIN - sinceSubmit) / 1000).toFixed(1) + 's', '#ce93d8');
          return;
        }
        if (st.continueAt && Date.now() - st.continueAt < 5000) return;

        if (!st.busy) {
          st.busy = true;
          st.continueClicked = true;
          st.tried.clear();
          st.lastSubmitAt = 0;

          // 优先点"继续学习"，没有就点"全部可点按钮里最像的"
          const target = qb.cont[0] || qb.all[0];
          const d = randInt(CFG.CONTINUE_MIN, CFG.CONTINUE_MAX);
          setStatus('等 ' + (d / 1000).toFixed(2) + 's 点继续学习', '#ff9800');
          setTimeout(() => {
            try {
              if (target) {
                target.click();
                st.continueAt = Date.now();
                LOG('点继续学习（' + (d / 1000).toFixed(2) + 's）文字=' + norm(txt(target)));
              } else {
                WARN('答对了但找不到按钮');
              }
            } catch (e) {}
            setTimeout(() => {
              if (v && v.paused && v.currentTime < v.duration - 3) v.play().catch(() => {});
              st.busy = false;
            }, 1500);
          }, d);
        }
        return;
      }

      /* ---------- ② 有 radio + 提交 ---------- */
      if (qb.submit.length && radios.length) {
        st.lastQuizSeenAt = Date.now();
        st.continueClicked = false;
        if (st.continueAt && Date.now() - st.continueAt < 2000) return;

        if (!st.busy) {
          st.busy = true;
          const labels = getQuizLabels();
          let idx = -1;
          for (let i = 0; i < radios.length; i++) if (!st.tried.has(i)) { idx = i; break; }
          if (idx === -1) { st.tried.clear(); idx = 0; }
          st.tried.add(idx);

          const d1 = randDelay();
          setStatus('等 ' + (d1 / 1000).toFixed(2) + 's 选答案', '#2196f3');

          setTimeout(() => {
            try {
              if (labels[idx]) labels[idx].click(); else radios[idx].click();
              if (!radios[idx].checked) {
                radios[idx].checked = true;
                radios[idx].dispatchEvent(new Event('change', { bubbles: true }));
              }
              const d2 = randDelay();
              setStatus('等 ' + (d2 / 1000).toFixed(2) + 's 点提交', '#2196f3');
              setTimeout(() => {
                try {
                  qb.submit[0].click();
                  st.lastSubmitAt = Date.now();
                  LOG('提交答案 → 冷却');
                } catch (e) {}
                st.busy = false;
              }, d2);
            } catch (e) { st.busy = false; }
          }, d1);
        }
        return;
      }

      /* ---------- ③ 视频播完 ---------- */
      const videoDone = v && v.duration > 0 && v.currentTime >= v.duration - 1.5;
      if (videoDone) {
        if (!st.videoDoneAt) {
          st.videoDoneAt = Date.now();
          const w = randInt(CFG.DONE_WAIT_MIN, CFG.DONE_WAIT_MAX);
          setStatus('播完，等 ' + (w / 1000).toFixed(2) + 's', '#2196f3');
          setTimeout(() => { st.quizReady = true; }, w);
        }
        if (!st.quizReady || st.busy) return;

        // ===== v7：提交后 8 秒验证，没成功就重试 =====
        if (st.quizSubmitted && Date.now() - st.quizSubmitted > 8000 && Date.now() - st.quizSubmitted < 90000000) {
          if (isInQuizPage() && getQuestions().length > 0) {
            st.submitRetries = (st.submitRetries || 0) + 1;
            if (st.submitRetries <= 3) {
              LOG("提交似乎没成功（还在测验页），重试 " + st.submitRetries + "/3");
              st.quizSubmitted = 0;
              st.answeredAll = 0;
              return;
            } else {
              WARN("提交连续失败 3 次，停止重试，请手动检查");
              setStatus("提交失败，需手动", "#f44336");
              st.quizSubmitted = Date.now() + 99999999;
            }
          }
        }

        const cb = getConfirmSubmitBtn();
        if (cb) {
          st.busy = true;
          const d = randDelay();
          setStatus('等 ' + (d / 1000).toFixed(2) + 's 确认提交', '#ff9800');
          setTimeout(() => {
            try { cb.click(); st.quizSubmitted = Date.now(); } catch (e) {}
            st.busy = false;
          }, d);
          return;
        }

        /* ===== v42: 本小节没有「章节测验」tab → 视频看完就是看完，直接下一节 ===== */
        if (!findQuizTab()) {
          if (!st.quizTabMissingAt) {
            st.quizTabMissingAt = Date.now();
            LOG("本小节没有「章节测验」tab，3 秒后确认无测验则直接下一节");
          } else if (Date.now() - st.quizTabMissingAt > 3000) {
            var __noQ42 = getQuizRadios().length === 0
                       && getQuizButtons().submit.length === 0
                       && !findSubmitButton()
                       && !isQuizFinished();
            if (__noQ42 && !st.busy) {
              st.busy = true; st.busyAt = Date.now();
              var __d42 = randDelay();
              setStatus("无章节测验，等 " + (__d42 / 1000).toFixed(2) + "s 点下一节", "#2196f3");
              setTimeout(function () {
                try {
                  if (clickNextChapter()) { LOG("无测验小节 → 已推进下一节"); }
                  st.quizTabMissingAt = 0;
                  st.quizTabTried = 0;
                } catch (e) {}
                st.busy = false; st.busyAt = 0;
              }, __d42);
              return;
            }
            st.quizTabMissingAt = 0;
          }
          return;
        }
        st.quizTabMissingAt = 0;

        if (!isInQuizPage()) {
          if (!st.busy) {
            st.busy = true;
            const d = randDelay();
            setStatus('等 ' + (d / 1000).toFixed(2) + 's 切章节测验', '#2196f3');
            setTimeout(() => {
              const ok = clickQuizTab();
              LOG(ok ? '已切章节测验' : '没找到章节测验 tab', ok ? '#4caf50' : '#f44336');
              st.busy = false;
            }, d);
          }
          return;
        }

        /* ===== v10: 按 name 分组答题（不依赖题目容器）===== */
        var chk1 = checkAllAnswered();
        if (chk1.totalInputs > 0 && !chk1.ok && !st.busy) {
          st.busy = true;
          var d1 = randDelay();
          setStatus("等 " + (d1 / 1000).toFixed(2) + "s 答题（共 " + chk1.total + " 题，还差 " + chk1.missing.length + "）");
          setTimeout(function () {
            var rr1 = answerAllGroups();
            LOG("本轮答了 " + rr1.done + " 题 / 共 " + rr1.total + " 题");
          }, d1);
          return;
        }
        if (chk1.totalInputs === 0) {
        if (!st.noInputWarned) { st.noInputWarned = 1; WARN("页面上没有 input（可能选项是纯 DOM），已改用 DOM 通道"); }
        } else if (chk1.ok) {
          LOG("全部 " + chk1.total + " 题已答，准备提交");
        }

        /* ===== v8: 提交前检查是否每题都选了 ===== */
        if ((!st.quizSubmitted || Date.now() - st.quizSubmitted > 15000) && !st.busy) {
          var chk = checkAllAnswered();
          if (chk.total > 0 && !chk.ok) {
            LOG("提交前检查：共 " + chk.total + " 题，未答 " + chk.missing.length + " 题（第 " + chk.missing.join(",") + " 题），先补答");
            setStatus("补答 " + chk.missing.length + " 题", "#ff9800");
            // 自动补答未选的题（放行一次答题流程）
            st.answeredAll = 0;
            return;
          }
          const sub = findSubmitButton();
          if (sub) {
            st.busy = true;
            const d = randDelay();
            setStatus('等 ' + (d / 1000).toFixed(2) + 's 交卷', '#ff9800');
            setTimeout(() => {
              try { sub.click(); st.quizSubmitted = Date.now(); } catch (e) {}
              st.busy = false;
            }, d);
            return;
          }
        }

        if (CFG.AUTO_NEXT && st.quizSubmitted && Date.now() - st.quizSubmitted > 5000 && Date.now() - st.quizSubmitted < 600000 && !st.busy) {
          const next = byText('下一节') || byText('下一小节');
          if (next) {
            st.busy = true;
            const d = randDelay();
            setStatus('等 ' + (d / 1000).toFixed(2) + 's 下一节', '#ff9800');
            setTimeout(() => {
              try {
                markNextClick();   /* v44 */
                next.click();
                st.chapterCount++;
                LOG('✅ 推进第 ' + st.chapterCount + ' 节', '#ff9800');
                st.quizReady = false; st.quizSubmitted = 0; st.videoDoneAt = 0;
                st.maxTime = 0; st.rollbackFixes = 0;
                st.lastSubmitAt = 0; st.lastQuizSeenAt = 0;
                st.lastProgressAt = Date.now();
                /* ===== v39: 换章节 = 一切归零，包括"已放弃(stalled)"状态 ===== */
                st.stalled = false; st.stallCount = 0;
                st.endedAt = 0; st.lastProgressTime = 0;
                st.finishedAt = 0; st.continueAt = 0;
                st.lastGoodTime = 0; st.continueClicked = false;
                st.busy = false; st.busyAt = 0;
                try { healReset(); } catch (e) {}
              } catch (e) {}
              st.busy = false;
            }, d);
          }
          return;
        }
        return;
      }

      /* ---------- ④ 纯测验页 ---------- */
      if (!v && CFG.AUTO_QUIZ && !st.busy && isInQuizPage()) {
        const cb2 = getConfirmSubmitBtn();
        if (cb2) { st.busy = true; setTimeout(() => { try { cb2.click(); } catch (e) {} st.busy = false; }, randDelay()); return; }
        /* ===== v10: 按 name 分组答题（不依赖题目容器）===== */
        var chk2 = checkAllAnswered();
        if (chk2.totalInputs > 0 && !chk2.ok) {
          st.busy = true;
          var d2 = randDelay();
          setStatus("等 " + (d2 / 1000).toFixed(2) + "s 答题（共 " + chk2.total + " 题，还差 " + chk2.missing.length + "）");
          setTimeout(function () {
            answerAllGroups(function (d, t) {
              LOG("本轮答了 " + d + " 题 / 共 " + t + " 题");
              st.busy = false;
            });
          }, d2);
          return;
        }
        if (chk2.totalInputs === 0) {
        if (!st.noInputWarned) { st.noInputWarned = 1; WARN("页面上没有 input（可能选项是纯 DOM），已改用 DOM 通道"); }
        } else {
          LOG("全部 " + chk2.total + " 题已答，准备提交");
          setStatus("已答完 " + chk2.total + " 题，准备提交");
        }
        /* ===== v14: 提交改成"15 秒内不重复，超时允许重试" ===== */
        var sinceSubmit = st.quizSubmitted ? (Date.now() - st.quizSubmitted) : 999999;
        if (sinceSubmit > 15000) {
          const sub2 = findSubmitButton();
          if (sub2) {
            st.busy = true;
            const d = randDelay();
            setStatus('等 ' + (d / 1000).toFixed(2) + 's 提交测验', '#ff9800');
            setTimeout(function () {
              try { sub2.click(); LOG("已点提交按钮"); st.quizSubmitted = Date.now(); } catch (e) { WARN("点提交失败: " + e.message); }
              st.busy = false;
            }, d);
            return;
          } else {
            if (!st.subNoBtnWarned) { st.subNoBtnWarned = 1; WARN("找不到提交按钮"); }
          }
        }
      }
    } catch (e) {
      console.warn(TAG + ' 异常：', e);
    }
  }, CFG.MAIN_MS));

  /* ============ 启动 ============ */
  if (document.body) ensurePanel();
  else window.addEventListener('DOMContentLoaded', ensurePanel);


  /* ===== v47: 切后台回来 → 清掉"后台期间积累的停滞"，从头评估当前页 ===== */
  function onBackFromBackground(reason) {
    var away = st.hiddenAt ? (Date.now() - st.hiddenAt) : 0;
    st.hiddenAt = 0;
    LOG("从后台恢复（" + reason + (away > 0 ? (", 离开 " + Math.round(away / 1000) + "s") : "") + "）→ 重置停滞与保险", "#4caf50");
    st.stalled = false; st.stallCount = 0;
    st.busy = false; st.busyAt = 0;
    st.lastProgressAt = Date.now();
    st.lastProgressTime = 0;
    st.endedAt = 0;
    st.videoDoneAt = 0;
    st.quizReady = false;
    st.pendingNext = 0;
    st.emptyAt = 0;
    st.quizTabMissingAt = 0;
    heal.stage = 0; heal.lastHealAt = 0;
    setStatus("已从后台恢复，" + CFG.RATE + "x 继续", "#4caf50");
    /* 如果是被降速挂起的，恢复后立刻补一次重播 */
    /* （pendingReplay 保留，由循环轮询执行） */
  }

  /* v47: document.hidden 被本脚本 hook 成恒 false，必须读原型上的原生 getter */
  function __reallyHidden() {
    try {
      var d = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      if (d && d.get) return d.get.call(document);
    } catch (e) {}
    try {
      var d2 = Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "hidden");
      if (d2 && d2.get) return d2.get.call(document);
    } catch (e) {}
    return false;
  }

  document.addEventListener("visibilitychange", function () {
    try {
      if (__reallyHidden()) { st.hiddenAt = Date.now(); }
      else if (st.hiddenAt) { onBackFromBackground("visibility"); }
    } catch (e) {}
  }, true);

  window.addEventListener("blur", function () {
    try { st.hiddenAt = Date.now(); } catch (e) {}
  });

  window.addEventListener("focus", function () {
    try {
      if (st.hiddenAt) onBackFromBackground("focus");
      else if (Date.now() - st.lastProgressAt > 12000) {
        /* 兜底：即使没抓到 hidden，只要"很久没进展"就当作刚从后台回来 */
        st.hiddenAt = st.lastProgressAt || (Date.now() - 60000);
        onBackFromBackground("focus-gap");
      }
    } catch (e) {}
  });


  LOG('🚀 v55 启动：' + CFG.RATE + 'x', '#2196f3');
  console.log(TAG + ' v5 新增：4 级自我修复（换点击/强制播放/移除遮罩）');
  console.log(TAG + ' v5 保险：真正无解才停手 + 面板自救日志');
  console.log(TAG + ' 停止：刷新页面');

  /* ===== v48: 启动自检（在不同电脑上排查问题时看这一组）===== */
  try {
    var __env = {
      UA: (navigator.userAgent || "").slice(0, 110),
      screen: screen.width + "x" + screen.height,
      dpr: (window.devicePixelRatio || 1),
      viewport: window.innerWidth + "x" + window.innerHeight,
      url: String(location.href).slice(0, 90),
      hasPointerEvent: (typeof PointerEvent !== "undefined"),
      canReachIframe: false,
      videoFound: false
    };
    try {
      var ifr = document.querySelectorAll("iframe");
      for (var __i = 0; __i < ifr.length && !__env.canReachIframe; __i++) {
        try { if (ifr[__i].contentDocument) __env.canReachIframe = true; } catch (e) {}
      }
    } catch (e) {}
    try { __env.videoFound = !!findVideo(); } catch (e) {}
    console.log(TAG + " —— 环境自检 ——");
    console.log("  UA         : " + __env.UA);
    console.log("  屏幕        : " + __env.screen + " / DPR " + __env.dpr);
    console.log("  视口        : " + __env.viewport);
    console.log("  页面        : " + __env.url);
    console.log("  PointerEvent: " + __env.hasPointerEvent);
    console.log("  可访问iframe: " + __env.canReachIframe + (__env.canReachIframe ? "" : "  ← 跨域，视频可能抓不到"));
    console.log("  当前有video : " + __env.videoFound + (__env.videoFound ? "" : "  ← 正常（还没点播放）"));
  } catch (e) { console.warn(TAG + " 自检异常", e); }
})();
