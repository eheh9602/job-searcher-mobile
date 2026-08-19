"use strict";

let currentJobs = [];
let selectedJob = null;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), 2200);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function valueOr(value, fallback = "원문 확인") {
  const v = String(value || "").trim();
  return v || fallback;
}

function guessJobLabel(job) {
  const text = `${job?.title || ""} ${job?.jobLabel || ""}`;
  const keywords = ["보건관리자", "산업간호사", "안전관리자", "간호사", "산업위생관리자"];
  return keywords.find((kw) => text.includes(kw)) || "보건관리자";
}

function guessEmploymentType(job) {
  if (job?.employment) return job.employment;
  const text = `${job?.title || ""} ${job?.experience || ""}`;
  const keywords = ["정규직", "계약직", "인턴", "파견직", "프리랜서", "촉탁직", "위촉직", "시간제", "일용직"];
  return keywords.find((kw) => text.includes(kw)) || "";
}

function shortLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return "지역확인";
  const tokens = raw.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (/(시|군|구)$/.test(t) && t.length > 1) return t.replace(/(시|군|구)$/, "");
  }
  return tokens[tokens.length - 1] || raw;
}

async function runSearch() {
  const keyword = $("keyword").value.trim() || "보건관리자";
  $("status").textContent = "사람인 · 잡코리아 · 인크루트에서 검색 중...";
  $("searchBtn").disabled = true;
  $("resultList").innerHTML = "";

  try {
    const res = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentJobs = data.jobs || [];
    renderResults(currentJobs);

    const bySource = {};
    currentJobs.forEach((job) => { bySource[job.source] = (bySource[job.source] || 0) + 1; });
    const summary = Object.entries(bySource).map(([name, count]) => `${name} ${count}건`).join(" · ");
    const failed = Object.keys(data.errors || {});

    let status = currentJobs.length ? `총 ${currentJobs.length}건${summary ? ` · ${summary}` : ""}` : "검색 결과가 없습니다.";
    if (failed.length) status += ` · 불러오기 실패: ${failed.join(", ")}`;
    $("status").textContent = status;
  } catch (error) {
    $("status").textContent = `검색 중 오류가 발생했습니다: ${error.message}`;
    renderEmpty("검색 API 연결을 확인해주세요.");
  } finally {
    $("searchBtn").disabled = false;
  }
}

function renderEmpty(message) {
  $("resultList").innerHTML = `<li class="empty">${escapeHtml(message)}</li>`;
}

function renderResults(jobs) {
  const list = $("resultList");
  list.innerHTML = "";
  if (!jobs.length) {
    renderEmpty("검색 결과가 없습니다.");
    return;
  }

  jobs.forEach((job, index) => {
    const li = document.createElement("li");
    li.className = "result-item";
    const meta = [job.location, job.experience, job.deadline].filter(Boolean).join(" · ");
    li.innerHTML = `
      <span class="src-tag">${escapeHtml(job.source)}</span>
      <p class="company">${escapeHtml(job.company || "회사명은 공고에서 확인")}</p>
      <p class="title">${escapeHtml(job.title)}</p>
      ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
    `;
    li.addEventListener("click", () => openDetail(index));
    list.appendChild(li);
  });
}

function openDetail(index) {
  selectedJob = { ...currentJobs[index] };
  $("sheetSource").textContent = selectedJob.source || "채용공고";
  $("sheetTitle").textContent = "공고 정보 확인";
  $("d_company").value = selectedJob.company || "";
  $("d_jobLabel").value = selectedJob.jobLabel || guessJobLabel(selectedJob);
  $("d_title").value = selectedJob.title || "";
  $("d_location").value = selectedJob.location || "";
  $("d_employment").value = selectedJob.employment || guessEmploymentType(selectedJob);
  $("d_experience").value = selectedJob.experience || "";
  $("d_deadline").value = selectedJob.deadline || "";
  showSheet("sheetBackdrop");
}

function syncSelectedFromForm() {
  if (!selectedJob) return null;
  selectedJob.company = $("d_company").value.trim();
  selectedJob.jobLabel = $("d_jobLabel").value.trim() || guessJobLabel(selectedJob);
  selectedJob.title = $("d_title").value.trim() || selectedJob.title;
  selectedJob.location = $("d_location").value.trim();
  selectedJob.employment = $("d_employment").value.trim();
  selectedJob.experience = $("d_experience").value.trim();
  selectedJob.deadline = $("d_deadline").value.trim();
  return selectedJob;
}

function showSheet(id) {
  $(id).classList.remove("hidden");
  $(id).setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function hideSheet(id) {
  $(id).classList.add("hidden");
  $(id).setAttribute("aria-hidden", "true");
  const anyOpen = ["sheetBackdrop", "draftBackdrop", "thumbBackdrop"].some((x) => !$(x).classList.contains("hidden"));
  if (!anyOpen) document.body.style.overflow = "";
}

function buildTitle(job) {
  const company = valueOr(job.company, "회사명 확인");
  const label = valueOr(job.jobLabel || guessJobLabel(job), "채용");
  const loc = shortLocation(job.location);
  const emp = job.employment ? ` ${job.employment}` : "";
  return `${company} ${label} 채용 | ${loc}${emp}`;
}

function hashtags(job) {
  const tags = [
    job.jobLabel || guessJobLabel(job),
    `${job.jobLabel || guessJobLabel(job)}채용`,
    "산업보건",
    "채용정보",
  ];
  if (job.company) tags.push(job.company.replace(/[\s㈜()주식회사]/g, ""));
  if (job.location) tags.push(`${shortLocation(job.location)}채용`);
  if (job.source) tags.push(job.source);
  return [...new Set(tags.filter(Boolean))].map((x) => `#${x.replace(/\s+/g, "")}`).join(" ");
}

function buildDraft(job) {
  const company = valueOr(job.company);
  const label = valueOr(job.jobLabel || guessJobLabel(job));
  const location = valueOr(job.location);
  const employment = valueOr(job.employment);
  const experience = valueOr(job.experience);
  const deadline = valueOr(job.deadline);

  return `[제목]\n${buildTitle(job)}\n\n[본문]\n안녕하세요. 고덕이네입니다.\n\n오늘 공유드릴 채용공고는 ${company} ${label} 채용입니다.\n관심 있으신 분들은 아래 내용 참고해 주세요.\n\n| 채용 요약\n- 회사명: ${company}\n- 모집 직무: ${job.title || label}\n- 근무 지역: ${location}\n- 고용 형태: ${employment}\n- 경력/지원자격: ${experience}\n- 접수 마감: ${deadline}\n- 공고 출처: ${valueOr(job.source)}\n\n| 확인할 내용\n- 세부 담당업무와 자격요건, 우대사항은 반드시 원문 공고에서 다시 확인해 주세요.\n- 채용 일정은 기업 사정에 따라 조기 마감 또는 변경될 수 있습니다.\n\n공고 원문\n${job.url || ""}\n\n${hashtags(job)}\n`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $("draftText").focus();
    $("draftText").select();
    document.execCommand("copy");
  }
}

// ---------------- Thumbnail ----------------
const SIZE = 1080;
const C = {
  navy: "#102a5c", blue: "#215ae2", line: "#d6dff0", soft: "#f5f8fe",
  white: "#ffffff", muted: "#6e7684", pale: "#e7eefc",
};

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fit(ctx, text, weight, maxWidth, start, min) {
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawRabbit(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = C.white;
  ctx.strokeStyle = C.navy;
  ctx.lineWidth = 7;

  // ears
  ctx.beginPath(); ctx.ellipse(-33, -73, 24, 52, -0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(33, -73, 24, 52, 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // face
  ctx.beginPath(); ctx.ellipse(0, 0, 78, 66, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.navy;
  ctx.beginPath(); ctx.arc(-25, -5, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(25, -5, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 15, 6, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(-12, 21, 14, 0.1, 1.25); ctx.stroke();
  ctx.beginPath(); ctx.arc(12, 21, 14, 1.9, 3.05); ctx.stroke();
  ctx.restore();
}

function iconPin(ctx, cx, cy) {
  ctx.strokeStyle = C.blue; ctx.fillStyle = C.blue; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy - 8, 19, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 8, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 13, cy + 5); ctx.lineTo(cx, cy + 30); ctx.lineTo(cx + 13, cy + 5); ctx.stroke();
}
function iconDoc(ctx, cx, cy) {
  ctx.strokeStyle = C.blue; ctx.lineWidth = 6; ctx.lineJoin = "round";
  ctx.strokeRect(cx - 21, cy - 28, 42, 56);
  [-10, 3, 16].forEach((dy) => { ctx.beginPath(); ctx.moveTo(cx - 12, cy + dy); ctx.lineTo(cx + 12, cy + dy); ctx.stroke(); });
}
function iconUser(ctx, cx, cy) {
  ctx.fillStyle = C.blue;
  ctx.beginPath(); ctx.arc(cx, cy - 14, 12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + 18, 23, Math.PI, 0); ctx.fill();
}
function iconCalendar(ctx, cx, cy) {
  ctx.strokeStyle = C.blue; ctx.fillStyle = C.blue; ctx.lineWidth = 6;
  rr(ctx, cx - 28, cy - 24, 56, 52, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 28, cy - 7); ctx.lineTo(cx + 28, cy - 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - 10, cy + 9, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 10, cy + 9, 4, 0, Math.PI * 2); ctx.fill();
}

async function drawThumbnail() {
  const job = syncSelectedFromForm();
  if (!job) return;
  const canvas = $("thumbCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.strokeStyle = C.blue; ctx.lineWidth = 9;
  rr(ctx, 18, 18, SIZE - 36, SIZE - 36, 44); ctx.stroke();

  const pad = 72;
  const maxW = SIZE - pad * 2;
  const label = `${job.jobLabel || guessJobLabel(job)} 채용`;
  ctx.font = "800 43px system-ui, sans-serif";
  const pillW = Math.min(maxW, ctx.measureText(label).width + 78);
  ctx.fillStyle = C.blue; rr(ctx, pad, 88, pillW, 88, 44); ctx.fill();
  ctx.fillStyle = C.white; ctx.textBaseline = "middle"; ctx.fillText(label, pad + 39, 132);

  const company = valueOr(job.company, "회사명 확인");
  const companySize = fit(ctx, company, 850, maxW - 190, 106, 50);
  ctx.font = `850 ${companySize}px system-ui, sans-serif`;
  ctx.fillStyle = C.navy; ctx.textBaseline = "alphabetic";
  ctx.fillText(company, pad, 310);

  // rabbit in upper right
  drawRabbit(ctx, 920, 205, 0.72);

  ctx.strokeStyle = C.line; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(pad, 362); ctx.lineTo(SIZE - pad, 362); ctx.stroke();

  const subtitle = job.title || `${label}`;
  const subSize = fit(ctx, subtitle, 750, maxW, 61, 34);
  ctx.font = `750 ${subSize}px system-ui, sans-serif`;
  ctx.fillStyle = C.blue; ctx.fillText(subtitle, pad, 452);

  ctx.font = "650 34px system-ui, sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText("채용공고 핵심정보", pad, 520);

  const cards = [
    [iconPin, valueOr(job.location, "원문 확인"), "근무지"],
    [iconDoc, valueOr(job.employment, "원문 확인"), "고용형태"],
    [iconUser, valueOr(job.experience, "원문 확인"), "경력/자격"],
    [iconCalendar, valueOr(job.deadline, "원문 확인"), "접수마감"],
  ];
  const gap = 18;
  const cardW = (SIZE - pad * 2 - gap * 3) / 4;
  const cardTop = 625;
  const cardH = 285;

  cards.forEach(([icon, value, caption], i) => {
    const x = pad + i * (cardW + gap);
    ctx.fillStyle = C.soft; ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    rr(ctx, x, cardTop, cardW, cardH, 24); ctx.fill(); ctx.stroke();
    const cx = x + cardW / 2;
    ctx.fillStyle = C.pale; ctx.beginPath(); ctx.arc(cx, cardTop + 72, 48, 0, Math.PI * 2); ctx.fill();
    icon(ctx, cx, cardTop + 72);
    const vSize = fit(ctx, value, 750, cardW - 24, 37, 17);
    ctx.font = `750 ${vSize}px system-ui, sans-serif`;
    ctx.fillStyle = C.navy; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(value, cx, cardTop + 165);
    ctx.font = "500 24px system-ui, sans-serif"; ctx.fillStyle = C.muted;
    ctx.fillText(caption, cx, cardTop + 217);
  });
  ctx.textAlign = "left";

  ctx.font = "800 28px system-ui, sans-serif";
  ctx.fillStyle = C.navy;
  ctx.fillText("고덕이네", SIZE - 190, 990);
}

// ---------------- Events ----------------
$("searchBtn").addEventListener("click", runSearch);
$("keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
    button.classList.add("active");
    $("keyword").value = button.dataset.keyword || "보건관리자";
    runSearch();
  });
});

$("sheetCloseBtn").addEventListener("click", () => hideSheet("sheetBackdrop"));
$("draftCloseBtn").addEventListener("click", () => hideSheet("draftBackdrop"));
$("thumbCloseBtn").addEventListener("click", () => hideSheet("thumbBackdrop"));
["sheetBackdrop", "draftBackdrop", "thumbBackdrop"].forEach((id) => {
  $(id).addEventListener("click", (e) => { if (e.target === $(id)) hideSheet(id); });
});

$("openOriginalBtn").addEventListener("click", () => {
  syncSelectedFromForm();
  if (selectedJob?.url) window.open(selectedJob.url, "_blank", "noopener");
});

$("draftBtn").addEventListener("click", () => {
  const job = syncSelectedFromForm();
  if (!job) return;
  $("draftText").value = buildDraft(job);
  hideSheet("sheetBackdrop");
  showSheet("draftBackdrop");
});

$("copyDraftBtn").addEventListener("click", async () => {
  await copyText($("draftText").value);
  showToast("본문을 복사했습니다.");
});

$("copyNaverBtn").addEventListener("click", async () => {
  await copyText($("draftText").value);
  showToast("복사 완료. 네이버 블로그를 엽니다.");
  setTimeout(() => window.open("https://m.blog.naver.com/", "_blank", "noopener"), 250);
});

$("thumbBtn").addEventListener("click", async () => {
  syncSelectedFromForm();
  hideSheet("sheetBackdrop");
  showSheet("thumbBackdrop");
  await drawThumbnail();
});
$("regenThumbBtn").addEventListener("click", drawThumbnail);
$("downloadThumbBtn").addEventListener("click", () => {
  const canvas = $("thumbCanvas");
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = valueOr(selectedJob?.company, "thumbnail").replace(/[^\w가-힣-]/g, "_");
    a.href = url;
    a.download = `고덕이네_채용썸네일_${safe}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    showToast("썸네일 저장을 시작했습니다.");
  }, "image/png");
});

// PWA install prompt (Android/Chrome 계열)
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("installBtn").classList.add("hidden");
});
window.addEventListener("appinstalled", () => $("installBtn").classList.add("hidden"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      registration.update().catch(() => {});
    } catch (_) {}
  });
}
