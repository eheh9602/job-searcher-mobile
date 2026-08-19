"use strict";

/* =========================================================
   상태
========================================================= */

let currentJobs = [];
let selectedJob = null;
let detailLoading = null;

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $("toast");
  if (!el) return;

  el.textContent = msg;
  el.classList.remove("hidden");

  clearTimeout(showToast._t);

  showToast._t = setTimeout(() => {
    el.classList.add("hidden");
  }, 2200);
}


/* =========================================================
   공통
========================================================= */

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}


function cleanValue(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const invalid = [
    "원문 확인",
    "회사명 원문 확인",
    "회사명은 공고에서 확인",
    "지역 원문 확인",
    "경력 원문 확인",
    "마감 원문 확인",
    "고용형태 확인",
    "접수마감 확인",
    "확인 필요",
    "undefined",
    "null",
  ];

  if (
    invalid.some(
      (item) =>
        text === item ||
        text.includes(item)
    )
  ) {
    return "";
  }

  return text;
}


function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value);

    if (cleaned) return cleaned;
  }

  return "";
}


function inferCompanyFromTitle(title) {
  const text = cleanValue(title);

  const match = text.match(/^\[([^\]]{2,50})\]/);

  if (match) return match[1].trim();

  return "";
}


function guessJobLabel(job) {
  if (cleanValue(job.jobTitle)) {
    return cleanValue(job.jobTitle);
  }

  const title = cleanValue(job.title);

  const keywords = [
    "보건관리자",
    "산업간호사",
    "안전관리자",
    "산업위생관리자",
    "산업위생",
    "간호사",
  ];

  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      return keyword;
    }
  }

  return "보건관리자";
}


function guessEmploymentType(job) {
  if (cleanValue(job.employment)) {
    return cleanValue(job.employment);
  }

  const text =
    `${job.title || ""} ${job.experience || ""}`;

  const types = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "촉탁직",
    "위촉직",
    "시간제",
  ];

  for (const type of types) {
    if (text.includes(type)) return type;
  }

  return "";
}


function shortLocation(location) {
  const value = cleanValue(location);

  if (!value) return "";

  const tokens =
    value.split(/\s+/).filter(Boolean);

  if (!tokens.length) return "";

  if (tokens.length >= 2) {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return tokens[0];
}


function companyName(job) {
  return firstValue(
    job.company,
    inferCompanyFromTitle(job.title)
  );
}


function normalizeTitle(title) {
  let text = cleanValue(title);

  if (!text) return "";

  text = text
    .replace(/\s*[-|]\s*(사람인|잡코리아|인크루트).*$/i, "")
    .replace(/\s*::\s*.*$/i, "")
    .trim();

  return text;
}


/* =========================================================
   검색
========================================================= */

async function runSearch() {
  const keyword =
    $("keyword")?.value.trim() ||
    "보건관리자";

  if ($("status")) {
    $("status").textContent =
      "사람인·잡코리아·인크루트에서 검색 중...";
  }

  if ($("searchBtn")) {
    $("searchBtn").disabled = true;
  }

  if ($("resultList")) {
    $("resultList").innerHTML = "";
  }

  try {
    const res = await fetch(
      `/api/search?keyword=${encodeURIComponent(keyword)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    currentJobs = (data.jobs || []).map((job) => ({
      ...job,
      company: cleanValue(job.company),
      location: cleanValue(job.location),
      employment: cleanValue(job.employment),
      experience: cleanValue(job.experience),
      education: cleanValue(job.education),
      deadline: cleanValue(job.deadline),
    }));

    renderResults(currentJobs);

    const bySource = {};

    currentJobs.forEach((job) => {
      bySource[job.source] =
        (bySource[job.source] || 0) + 1;
    });

    const summary =
      Object.entries(bySource)
        .map(([name, count]) =>
          `${name} ${count}건`
        )
        .join(" · ");

    const failedNames =
      Object.keys(data.errors || {});

    let statusText = currentJobs.length
      ? `총 ${currentJobs.length}건${summary ? ` (${summary})` : ""}`
      : "검색 결과가 없습니다.";

    if (failedNames.length) {
      statusText +=
        ` · 일부 검색 실패: ${failedNames.join(", ")}`;
    }

    if ($("status")) {
      $("status").textContent = statusText;
    }
  } catch (error) {
    if ($("status")) {
      $("status").textContent =
        `검색 중 오류가 발생했습니다: ${error.message}`;
    }
  } finally {
    if ($("searchBtn")) {
      $("searchBtn").disabled = false;
    }
  }
}


function renderResults(jobs) {
  const list = $("resultList");

  if (!list) return;

  list.innerHTML = "";

  jobs.forEach((job, index) => {
    const li = document.createElement("li");

    li.className = "result-item";

    const company =
      companyName(job) || "회사명 확인 중";

    const meta = [
      cleanValue(job.location),
      cleanValue(job.employment),
      cleanValue(job.experience),
      cleanValue(job.deadline),
    ]
      .filter(Boolean)
      .join(" · ");

    li.innerHTML = `
      <span class="src-tag">${escapeHtml(job.source)}</span>
      <p class="company">${escapeHtml(company)}</p>
      <p class="title">${escapeHtml(normalizeTitle(job.title))}</p>
      ${
        meta
          ? `<p class="result-meta">${escapeHtml(meta)}</p>`
          : ""
      }
    `;

    li.addEventListener(
      "click",
      () => openSheet(index)
    );

    list.appendChild(li);
  });
}


/* =========================================================
   상세 조회
========================================================= */

async function fetchDetail(job) {
  if (!job?.url) return job;

  if (job.detailLoaded) {
    return job;
  }

  const endpoint =
    `/api/detail` +
    `?source=${encodeURIComponent(job.source || "")}` +
    `&url=${encodeURIComponent(job.url)}`;

  const res = await fetch(endpoint, {
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(
      data.error ||
      `상세정보 HTTP ${res.status}`
    );
  }

  const detail = data.detail || {};

  const merged = {
    ...job,

    company: firstValue(
      detail.company,
      job.company,
      inferCompanyFromTitle(job.title)
    ),

    title: firstValue(
      normalizeTitle(detail.title),
      normalizeTitle(job.title)
    ),

    jobTitle: firstValue(
      detail.jobTitle,
      job.jobTitle
    ),

    location: firstValue(
      detail.location,
      job.location
    ),

    employment: firstValue(
      detail.employment,
      job.employment
    ),

    experience: firstValue(
      detail.experience,
      job.experience
    ),

    education: firstValue(
      detail.education,
      job.education
    ),

    deadline: firstValue(
      detail.deadline,
      job.deadline
    ),

    duties: firstValue(
      detail.duties,
      job.duties
    ),

    requirements: firstValue(
      detail.requirements,
      job.requirements
    ),

    preferences: firstValue(
      detail.preferences,
      job.preferences
    ),

    workConditions: firstValue(
      detail.workConditions,
      job.workConditions
    ),

    detailLoaded: true,
  };

  return merged;
}


async function ensureSelectedDetail() {
  if (!selectedJob) return null;

  if (selectedJob.detailLoaded) {
    return selectedJob;
  }

  if (detailLoading) {
    return detailLoading;
  }

  detailLoading = (async () => {
    try {
      const enriched =
        await fetchDetail(selectedJob);

      selectedJob = enriched;

      const index = currentJobs.findIndex(
        (job) => job.url === enriched.url
      );

      if (index >= 0) {
        currentJobs[index] = enriched;
      }

      updateSheet();

      return enriched;
    } finally {
      detailLoading = null;
    }
  })();

  return detailLoading;
}


/* =========================================================
   상세 시트
========================================================= */

async function openSheet(index) {
  selectedJob = currentJobs[index];

  updateSheet(true);

  $("sheetBackdrop")?.classList.remove(
    "hidden"
  );

  try {
    await ensureSelectedDetail();
  } catch (error) {
    updateSheet(false);

    showToast(
      "상세정보 일부를 가져오지 못했어요. 원문은 열 수 있습니다."
    );
  }
}


function updateSheet(loading = false) {
  if (!selectedJob) return;

  if ($("sheetTitle")) {
    $("sheetTitle").textContent =
      normalizeTitle(selectedJob.title) ||
      "채용공고";
  }

  if ($("sheetMeta")) {
    if (loading) {
      $("sheetMeta").textContent =
        "상세 채용정보를 불러오는 중...";
      return;
    }

    const meta = [
      companyName(selectedJob),
      cleanValue(selectedJob.location),
      guessEmploymentType(selectedJob),
      cleanValue(selectedJob.experience),
      cleanValue(selectedJob.deadline)
        ? `마감 ${cleanValue(selectedJob.deadline)}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    $("sheetMeta").textContent =
      meta || "상세정보는 원문에서 확인해주세요.";
  }

  fillDetailEditForm(selectedJob);
}


function closeSheet() {
  $("sheetBackdrop")?.classList.add(
    "hidden"
  );
}


/* =========================================================
   향후 index.html 정보수정 화면 대응
========================================================= */

function setOptionalInput(id, value) {
  const el = $(id);

  if (el) {
    el.value = cleanValue(value);
  }
}


function fillDetailEditForm(job) {
  if (!job) return;

  setOptionalInput(
    "d_company",
    companyName(job)
  );

  setOptionalInput(
    "d_jobTitle",
    guessJobLabel(job)
  );

  setOptionalInput(
    "d_location",
    job.location
  );

  setOptionalInput(
    "d_employment",
    guessEmploymentType(job)
  );

  setOptionalInput(
    "d_experience",
    job.experience
  );

  setOptionalInput(
    "d_education",
    job.education
  );

  setOptionalInput(
    "d_deadline",
    job.deadline
  );

  setOptionalInput(
    "d_duties",
    job.duties
  );

  setOptionalInput(
    "d_requirements",
    job.requirements
  );

  setOptionalInput(
    "d_preferences",
    job.preferences
  );

  setOptionalInput(
    "d_workConditions",
    job.workConditions
  );
}


function applyDetailEditForm() {
  if (!selectedJob) return;

  const get = (id, fallback) =>
    cleanValue($(id)?.value) ||
    fallback ||
    "";

  selectedJob = {
    ...selectedJob,

    company: get(
      "d_company",
      selectedJob.company
    ),

    jobTitle: get(
      "d_jobTitle",
      selectedJob.jobTitle
    ),

    location: get(
      "d_location",
      selectedJob.location
    ),

    employment: get(
      "d_employment",
      selectedJob.employment
    ),

    experience: get(
      "d_experience",
      selectedJob.experience
    ),

    education: get(
      "d_education",
      selectedJob.education
    ),

    deadline: get(
      "d_deadline",
      selectedJob.deadline
    ),

    duties: get(
      "d_duties",
      selectedJob.duties
    ),

    requirements: get(
      "d_requirements",
      selectedJob.requirements
    ),

    preferences: get(
      "d_preferences",
      selectedJob.preferences
    ),

    workConditions: get(
      "d_workConditions",
      selectedJob.workConditions
    ),
  };

  const index = currentJobs.findIndex(
    (job) => job.url === selectedJob.url
  );

  if (index >= 0) {
    currentJobs[index] = selectedJob;
  }

  updateSheet();

  showToast("수정 내용을 반영했어요.");
}


/* =========================================================
   블로그 초안
========================================================= */

function sectionLines(value) {
  const text = cleanValue(value);

  if (!text) return [];

  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(
          /^[•·ㆍ\-–—※＊*▶▷▪■□○●]+\s*/,
          ""
        )
        .trim()
    )
    .filter(Boolean)
    .filter(
      (item, index, arr) =>
        arr.indexOf(item) === index
    )
    .slice(0, 8);
}


function makeBulletSection(title, value) {
  const lines = sectionLines(value);

  if (!lines.length) return "";

  return [
    `| ${title}`,
    "",
    ...lines.map((line) => `- ${line}`),
    "",
  ].join("\n");
}


function buildBlogTitle(job) {
  const company =
    companyName(job) || "채용기업";

  const label = guessJobLabel(job);

  const location =
    shortLocation(job.location);

  const employment =
    guessEmploymentType(job);

  const extras = [
    location,
    employment,
  ].filter(Boolean);

  return (
    `${company} ${label} 채용` +
    (extras.length
      ? ` | ${extras.join(" · ")}`
      : "")
  );
}


function buildHashtags(job) {
  const tags = [];

  const add = (value) => {
    const tag =
      String(value || "")
        .replace(
          /[^가-힣a-zA-Z0-9]/g,
          ""
        )
        .trim();

    if (
      tag &&
      !tags.includes(tag)
    ) {
      tags.push(tag);
    }
  };

  const label = guessJobLabel(job);
  const company = companyName(job);
  const location =
    shortLocation(job.location);

  add(label);
  add(`${label}채용`);
  add("산업보건");
  add("채용정보");

  if (
    label.includes("보건") ||
    label.includes("간호사")
  ) {
    add("산업간호사");
  }

  add(company);

  if (location) {
    add(`${location}채용`);
  }

  add(job.source);

  return tags
    .slice(0, 10)
    .map((tag) => `#${tag}`)
    .join(" ");
}


function buildDraft(job) {
  const company =
    companyName(job) || "채용기업";

  const label =
    guessJobLabel(job);

  const location =
    cleanValue(job.location);

  const employment =
    guessEmploymentType(job);

  const experience =
    cleanValue(job.experience);

  const education =
    cleanValue(job.education);

  const deadline =
    cleanValue(job.deadline);

  const summary = [
    ["회사명", company],
    ["모집 직무", label],
    ["공고명", normalizeTitle(job.title)],
    ["근무 지역", location],
    ["고용 형태", employment],
    ["경력", experience],
    ["학력", education],
    ["접수 마감", deadline],
    ["공고 출처", cleanValue(job.source)],
  ]
    .filter(([, value]) => value)
    .map(
      ([labelText, value]) =>
        `- ${labelText}: ${value}`
    )
    .join("\n");

  const introLocation =
    shortLocation(location);

  const intro = introLocation
    ? `${introLocation} 지역에서 ${label} 채용을 찾고 계셨다면 한 번 확인해보셔도 좋을 것 같습니다.`
    : `${label} 채용을 찾고 계셨다면 한 번 확인해보셔도 좋을 것 같습니다.`;

  const sections = [
    makeBulletSection(
      "주요 업무",
      job.duties
    ),

    makeBulletSection(
      "지원자격",
      job.requirements
    ),

    makeBulletSection(
      "우대사항",
      job.preferences
    ),

    makeBulletSection(
      "근무조건",
      job.workConditions
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const fallbackNotice =
    !sections
      ? `| 지원 전 확인사항

- 상세 업무와 자격요건, 우대사항은 공고 원문에서 한 번 더 확인해주세요.
- 실제 접수 마감일은 채용사이트 사정에 따라 변경될 수 있습니다.

`
      : "";

  return `[제목]
${buildBlogTitle(job)}

[본문]
[여기에 대표 썸네일 이미지를 삽입하세요]

안녕하세요. 고덕이네입니다.

오늘 공유드릴 채용공고는
${company} ${label} 채용입니다.

${intro}

| 채용 요약

${summary}

${sections}${fallbackNotice}| 지원 전 체크

- 지원 전 모집요강과 자격요건을 원문에서 최종 확인해주세요.
${deadline ? `- 현재 확인된 접수 마감 정보는 ${deadline}입니다.` : "- 접수 마감일은 공고 원문에서 확인해주세요."}

공고 원문
${job.url || ""}

${buildHashtags(job)}
`;
}


/* =========================================================
   Canvas 썸네일
========================================================= */

const CANVAS_SIZE = 1080;

const COLORS = {
  navy: "#102a5c",
  blue: "#2563eb",
  vividBlue: "#215ae2",
  lightLine: "#d6dff0",
  cardBg: "#f7fafe",
  white: "#ffffff",
  gray: "#6e7684",
  paleBlue: "#e8efff",
};


function roundRectPath(
  ctx,
  x,
  y,
  w,
  h,
  r
) {
  const rr =
    Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + rr, y);

  ctx.arcTo(
    x + w,
    y,
    x + w,
    y + h,
    rr
  );

  ctx.arcTo(
    x + w,
    y + h,
    x,
    y + h,
    rr
  );

  ctx.arcTo(
    x,
    y + h,
    x,
    y,
    rr
  );

  ctx.arcTo(
    x,
    y,
    x + w,
    y,
    rr
  );

  ctx.closePath();
}


function canvasFont(
  weight,
  size
) {
  return `${weight} ${size}px Pretendard, "Noto Sans KR", Arial, sans-serif`;
}


function fitFontSize(
  ctx,
  text,
  weight,
  maxWidth,
  startSize,
  minSize
) {
  let size = startSize;

  ctx.font =
    canvasFont(weight, size);

  while (
    size > minSize &&
    ctx.measureText(text).width >
      maxWidth
  ) {
    size -= 2;

    ctx.font =
      canvasFont(weight, size);
  }

  return size;
}


/* =========================================================
   썸네일 아이콘
========================================================= */

function drawIconLocation(
  ctx,
  cx,
  cy,
  s,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, s * 0.15);

  ctx.beginPath();
  ctx.arc(
    cx,
    cy - s * 0.18,
    s * 0.55,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    cx,
    cy - s * 0.18,
    s * 0.17,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(
    cx - s * 0.36,
    cy + s * 0.18
  );
  ctx.lineTo(
    cx,
    cy + s * 0.85
  );
  ctx.lineTo(
    cx + s * 0.36,
    cy + s * 0.18
  );
  ctx.stroke();
}


function drawIconDoc(
  ctx,
  cx,
  cy,
  s,
  color
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, s * 0.14);

  const w = s * 1.15;
  const h = s * 1.45;

  ctx.strokeRect(
    cx - w / 2,
    cy - h / 2,
    w,
    h
  );

  for (let i = 0; i < 3; i++) {
    const y =
      cy - h * 0.22 + i * s * 0.32;

    ctx.beginPath();

    ctx.moveTo(
      cx - w * 0.28,
      y
    );

    ctx.lineTo(
      cx + w * 0.28,
      y
    );

    ctx.stroke();
  }
}


function drawIconPerson(
  ctx,
  cx,
  cy,
  s,
  color
) {
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(
    cx,
    cy - s * 0.35,
    s * 0.28,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.arc(
    cx,
    cy + s * 0.38,
    s * 0.56,
    Math.PI,
    0
  );
  ctx.fill();
}


function drawIconCalendar(
  ctx,
  cx,
  cy,
  s,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  ctx.lineWidth =
    Math.max(3, s * 0.14);

  roundRectPath(
    ctx,
    cx - s,
    cy - s * 0.72,
    s * 2,
    s * 1.6,
    s * 0.18
  );

  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(
    cx - s,
    cy - s * 0.25
  );
  ctx.lineTo(
    cx + s,
    cy - s * 0.25
  );
  ctx.stroke();

  [-0.45, 0.45].forEach((dx) => {
    ctx.beginPath();

    ctx.moveTo(
      cx + s * dx,
      cy - s
    );

    ctx.lineTo(
      cx + s * dx,
      cy - s * 0.55
    );

    ctx.stroke();
  });

  for (let row = 0; row < 2; row++) {
    for (
      let col = 0;
      col < 3;
      col++
    ) {
      ctx.beginPath();

      ctx.arc(
        cx -
          s * 0.48 +
          col * s * 0.48,
        cy +
          s * 0.08 +
          row * s * 0.36,
        s * 0.07,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }
}


const ICONS = {
  location: drawIconLocation,
  doc: drawIconDoc,
  person: drawIconPerson,
  calendar: drawIconCalendar,
};


/* =========================================================
   토끼
========================================================= */

let mascotImg = null;
let mascotChecked = false;


function getMascotImage() {
  if (mascotChecked) {
    return Promise.resolve(mascotImg);
  }

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      mascotImg = img;
      mascotChecked = true;
      resolve(img);
    };

    img.onerror = () => {
      mascotImg = null;
      mascotChecked = true;
      resolve(null);
    };

    img.src =
      `/icons/mascot-rabbit.png?v=2`;
  });
}


/*
 * PNG가 없거나 깨져도 쓸 수 있는
 * 단순 토끼 라인 아이콘
 */
function drawFallbackRabbit(
  ctx,
  cx,
  cy,
  scale
) {
  ctx.save();

  ctx.strokeStyle = COLORS.navy;
  ctx.fillStyle = COLORS.white;
  ctx.lineWidth =
    Math.max(4, scale * 0.055);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /* 귀 */
  ctx.beginPath();

  ctx.ellipse(
    cx - scale * 0.22,
    cy - scale * 0.62,
    scale * 0.13,
    scale * 0.34,
    -0.12,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.ellipse(
    cx + scale * 0.22,
    cy - scale * 0.62,
    scale * 0.13,
    scale * 0.34,
    0.12,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  /* 얼굴 */
  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    scale * 0.48,
    0,
    Math.PI * 2
  );

  ctx.fill();
  ctx.stroke();

  /* 눈 */
  ctx.fillStyle = COLORS.navy;

  [
    cx - scale * 0.16,
    cx + scale * 0.16,
  ].forEach((x) => {
    ctx.beginPath();

    ctx.arc(
      x,
      cy - scale * 0.05,
      scale * 0.035,
      0,
      Math.PI * 2
    );

    ctx.fill();
  });

  /* 코 */
  ctx.beginPath();

  ctx.arc(
    cx,
    cy + scale * 0.08,
    scale * 0.025,
    0,
    Math.PI * 2
  );

  ctx.fill();

  /* 입 */
  ctx.strokeStyle = COLORS.navy;
  ctx.lineWidth =
    Math.max(3, scale * 0.035);

  ctx.beginPath();

  ctx.moveTo(
    cx,
    cy + scale * 0.1
  );

  ctx.lineTo(
    cx,
    cy + scale * 0.19
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(
    cx,
    cy + scale * 0.19
  );

  ctx.quadraticCurveTo(
    cx - scale * 0.08,
    cy + scale * 0.25,
    cx - scale * 0.13,
    cy + scale * 0.2
  );

  ctx.moveTo(
    cx,
    cy + scale * 0.19
  );

  ctx.quadraticCurveTo(
    cx + scale * 0.08,
    cy + scale * 0.25,
    cx + scale * 0.13,
    cy + scale * 0.2
  );

  ctx.stroke();

  ctx.restore();
}


/* =========================================================
   썸네일 데이터
========================================================= */

function thumbnailValues(job) {
  return {
    company:
      companyName(job) ||
      "채용공고",

    jobLabel:
      guessJobLabel(job),

    location:
      cleanValue(job.location),

    employment:
      guessEmploymentType(job),

    experience:
      cleanValue(job.experience),

    deadline:
      cleanValue(job.deadline),
  };
}


function openThumbSheet() {
  if (!selectedJob) return;

  const job = selectedJob;
  const values =
    thumbnailValues(job);

  if ($("f_company")) {
    $("f_company").value =
      values.company;
  }

  if ($("f_jobLabel")) {
    $("f_jobLabel").value =
      values.jobLabel;
  }

  if ($("f_sub1")) {
    $("f_sub1").value =
      values.company;
  }

  if ($("f_sub2")) {
    const second = [
      cleanValue(job.jobTitle),
      normalizeTitle(job.title),
    ].find(Boolean);

    $("f_sub2").value =
      second || `${values.jobLabel} 채용`;
  }

  if ($("f_location")) {
    $("f_location").value =
      values.location;
  }

  if ($("f_employment")) {
    $("f_employment").value =
      values.employment;
  }

  if ($("f_experience")) {
    $("f_experience").value =
      values.experience;
  }

  if ($("f_deadline")) {
    $("f_deadline").value =
      values.deadline;
  }

  if ($("f_useMascot")) {
    $("f_useMascot").checked = true;
  }

  closeSheet();

  $("thumbBackdrop")?.classList.remove(
    "hidden"
  );

  drawThumbnail();
}


/* =========================================================
   썸네일 그리기
========================================================= */

async function drawThumbnail() {
  const canvas = $("thumbCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  const company =
    cleanValue($("f_company")?.value) ||
    "채용공고";

  const jobLabel =
    cleanValue($("f_jobLabel")?.value) ||
    "보건관리자";

  const sub1 =
    cleanValue($("f_sub1")?.value);

  const sub2 =
    cleanValue($("f_sub2")?.value);

  const location =
    cleanValue($("f_location")?.value);

  const employment =
    cleanValue($("f_employment")?.value);

  const experience =
    cleanValue($("f_experience")?.value);

  const deadline =
    cleanValue($("f_deadline")?.value);

  const useMascot =
    $("f_useMascot")
      ? $("f_useMascot").checked
      : true;

  ctx.clearRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );

  ctx.fillStyle = COLORS.white;

  ctx.fillRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );

  /* 외곽 */
  ctx.strokeStyle =
    COLORS.vividBlue;
  ctx.lineWidth = 8;

  roundRectPath(
    ctx,
    20,
    20,
    1040,
    1040,
    48
  );

  ctx.stroke();

  const pad = 72;

  /* 상단 직무 라벨 */
  const labelText =
    `${jobLabel} 채용`;

  ctx.font =
    canvasFont(700, 42);

  const labelWidth =
    Math.min(
      ctx.measureText(labelText).width +
        70,
      470
    );

  ctx.fillStyle =
    COLORS.vividBlue;

  roundRectPath(
    ctx,
    pad,
    86,
    labelWidth,
    86,
    43
  );

  ctx.fill();

  ctx.fillStyle = COLORS.white;
  ctx.font =
    canvasFont(700, 42);
  ctx.textBaseline = "middle";

  ctx.fillText(
    labelText,
    pad + 34,
    129
  );

  /* 토끼 - 우측 상단 */
  if (useMascot) {
    const img =
      await getMascotImage();

    if (img) {
      const targetH = 145;
      const ratio =
        targetH / img.height;

      const targetW =
        img.width * ratio;

      ctx.drawImage(
        img,
        CANVAS_SIZE -
          pad -
          targetW,
        72,
        targetW,
        targetH
      );
    } else {
      drawFallbackRabbit(
        ctx,
        CANVAS_SIZE - 158,
        135,
        112
      );
    }
  }

  /* 회사명 */
  const maxCompanyWidth =
    CANVAS_SIZE - pad * 2;

  const companySize =
    fitFontSize(
      ctx,
      company,
      800,
      maxCompanyWidth,
      98,
      50
    );

  ctx.font =
    canvasFont(800, companySize);

  ctx.fillStyle =
    COLORS.navy;

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    company,
    pad,
    290
  );

  /* 구분선 */
  ctx.strokeStyle =
    COLORS.lightLine;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(pad, 338);
  ctx.lineTo(
    CANVAS_SIZE - pad,
    338
  );
  ctx.stroke();

  /* 부제 */
  let textY = 414;

  const subtitleLines = [
    sub1,
    sub2,
  ].filter(
    (line, index, arr) =>
      line &&
      arr.indexOf(line) === index &&
      line !== company
  );

  ctx.fillStyle =
    COLORS.blue;

  subtitleLines
    .slice(0, 2)
    .forEach((line) => {
      const size =
        fitFontSize(
          ctx,
          line,
          700,
          CANVAS_SIZE -
            pad * 2,
          52,
          30
        );

      ctx.font =
        canvasFont(700, size);

      ctx.fillText(
        line,
        pad,
        textY
      );

      textY +=
        size + 34;
    });

  /* 확보된 정보만 카드 생성 */
  const cards = [
    {
      icon: "location",
      value: location,
      caption: "근무지",
    },
    {
      icon: "doc",
      value: employment,
      caption: "고용형태",
    },
    {
      icon: "person",
      value: experience,
      caption: "경력/자격",
    },
    {
      icon: "calendar",
      value: deadline,
      caption: "접수마감",
    },
  ].filter(
    (card) =>
      cleanValue(card.value)
  );

  const cardTop = 690;
  const cardH = 240;

  if (cards.length) {
    const gap =
      cards.length === 1
        ? 0
        : 18;

    const available =
      CANVAS_SIZE - pad * 2;

    const cardW =
      cards.length === 1
        ? Math.min(400, available)
        : (
            available -
            gap *
              (cards.length - 1)
          ) /
          cards.length;

    let startX =
      cards.length === 1
        ? (CANVAS_SIZE - cardW) / 2
        : pad;

    cards.forEach((card) => {
      ctx.fillStyle =
        COLORS.cardBg;

      ctx.strokeStyle =
        COLORS.lightLine;

      ctx.lineWidth = 2;

      roundRectPath(
        ctx,
        startX,
        cardTop,
        cardW,
        cardH,
        22
      );

      ctx.fill();
      ctx.stroke();

      const cx =
        startX + cardW / 2;

      const iconY =
        cardTop + 68;

      ctx.fillStyle =
        COLORS.paleBlue;

      ctx.beginPath();

      ctx.arc(
        cx,
        iconY,
        47,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ICONS[card.icon](
        ctx,
        cx,
        iconY,
        25,
        COLORS.vividBlue
      );

      const valueSize =
        fitFontSize(
          ctx,
          card.value,
          700,
          cardW - 26,
          35,
          19
        );

      ctx.font =
        canvasFont(
          700,
          valueSize
        );

      ctx.fillStyle =
        COLORS.navy;

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "alphabetic";

      ctx.fillText(
        card.value,
        cx,
        cardTop + 158
      );

      ctx.font =
        canvasFont(400, 24);

      ctx.fillStyle =
        COLORS.gray;

      ctx.fillText(
        card.caption,
        cx,
        cardTop + 202
      );

      ctx.textAlign =
        "left";

      startX +=
        cardW + gap;
    });
  }

  /* 블로그명 */
  ctx.font =
    canvasFont(700, 30);

  ctx.fillStyle =
    COLORS.navy;

  ctx.textAlign = "right";

  ctx.fillText(
    "고덕이네",
    CANVAS_SIZE - pad,
    1000
  );

  ctx.textAlign = "left";
}


/* =========================================================
   이벤트
========================================================= */

$("searchBtn")?.addEventListener(
  "click",
  runSearch
);


$("keyword")?.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      runSearch();
    }
  }
);


$("sheetCloseBtn")?.addEventListener(
  "click",
  closeSheet
);


$("sheetBackdrop")?.addEventListener(
  "click",
  (event) => {
    if (
      event.target ===
      $("sheetBackdrop")
    ) {
      closeSheet();
    }
  }
);


$("openOriginalBtn")?.addEventListener(
  "click",
  () => {
    if (selectedJob?.url) {
      window.open(
        selectedJob.url,
        "_blank"
      );
    }
  }
);


/* 상세정보 다시 불러오기 */
$("reloadDetailBtn")?.addEventListener(
  "click",
  async () => {
    if (!selectedJob) return;

    selectedJob.detailLoaded = false;

    if ($("sheetMeta")) {
      $("sheetMeta").textContent =
        "상세정보를 다시 불러오는 중...";
    }

    try {
      await ensureSelectedDetail();

      showToast(
        "상세정보를 다시 불러왔어요."
      );
    } catch {
      showToast(
        "상세정보를 불러오지 못했어요."
      );
    }
  }
);


/* 상세정보 수정값 저장 */
$("saveDetailBtn")?.addEventListener(
  "click",
  applyDetailEditForm
);


/* 블로그 초안 */
$("draftBtn")?.addEventListener(
  "click",
  async () => {
    if (!selectedJob) return;

    try {
      await ensureSelectedDetail();
    } catch {
      /* 상세 실패 시 현재 데이터로 계속 */
    }

    if ($("draftText")) {
      $("draftText").value =
        buildDraft(selectedJob);
    }

    closeSheet();

    $("draftBackdrop")
      ?.classList.remove("hidden");
  }
);


$("draftCloseBtn")?.addEventListener(
  "click",
  () => {
    $("draftBackdrop")
      ?.classList.add("hidden");
  }
);


$("draftBackdrop")?.addEventListener(
  "click",
  (event) => {
    if (
      event.target ===
      $("draftBackdrop")
    ) {
      $("draftBackdrop")
        ?.classList.add("hidden");
    }
  }
);


$("copyDraftBtn")?.addEventListener(
  "click",
  async () => {
    const text =
      $("draftText")?.value || "";

    try {
      await navigator.clipboard.writeText(
        text
      );

      showToast(
        "클립보드에 복사했어요."
      );
    } catch {
      if ($("draftText")) {
        $("draftText").select();

        document.execCommand(
          "copy"
        );

        showToast(
          "클립보드에 복사했어요."
        );
      }
    }
  }
);


/* 썸네일 */
$("thumbBtn")?.addEventListener(
  "click",
  async () => {
    if (!selectedJob) return;

    try {
      await ensureSelectedDetail();
    } catch {
      /* 현재 데이터 사용 */
    }

    openThumbSheet();
  }
);


$("thumbCloseBtn")?.addEventListener(
  "click",
  () => {
    $("thumbBackdrop")
      ?.classList.add("hidden");
  }
);


$("regenThumbBtn")?.addEventListener(
  "click",
  drawThumbnail
);


[
  "f_company",
  "f_jobLabel",
  "f_sub1",
  "f_sub2",
  "f_location",
  "f_employment",
  "f_experience",
  "f_deadline",
  "f_useMascot",
].forEach((id) => {
  const el = $(id);

  if (!el) return;

  el.addEventListener(
    "input",
    drawThumbnail
  );

  el.addEventListener(
    "change",
    drawThumbnail
  );
});


$("downloadThumbBtn")?.addEventListener(
  "click",
  () => {
    const canvas =
      $("thumbCanvas");

    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const url =
          URL.createObjectURL(blob);

        const a =
          document.createElement("a");

        const name =
          (
            $("f_company")?.value ||
            "thumbnail"
          )
            .replace(
              /[^\w가-힣()]/g,
              "_"
            );

        a.href = url;

        a.download =
          `썸네일_${name}.png`;

        document.body.appendChild(a);

        a.click();
        a.remove();

        URL.revokeObjectURL(url);

        showToast(
          "썸네일을 저장했어요."
        );
      },
      "image/png"
    );
  }
);


/* =========================================================
   서비스워커
========================================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }
  );
}
