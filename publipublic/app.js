"use strict";

/* =========================================================
   상태
========================================================= */

let currentJobs = [];
let selectedJob = null;
let detailLoading = null;
let lastSearchKeyword = "보건관리자";

const $ = (id) =>
  document.getElementById(id);


/* =========================================================
   토스트
========================================================= */

function showToast(message) {
  const el = $("toast");

  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");

  clearTimeout(showToast._timer);

  showToast._timer = setTimeout(() => {
    el.classList.add("hidden");
  }, 2200);
}


/* =========================================================
   공통
========================================================= */

function escapeHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char])
  );
}


function cleanValue(value) {
  const text =
    String(value || "").trim();

  if (!text) return "";

  const bad = [
    "원문 확인",
    "회사명 확인",
    "회사명 원문 확인",
    "지역 원문 확인",
    "경력 원문 확인",
    "마감 원문 확인",
    "고용형태 확인",
    "undefined",
    "null",
    "n/a",
  ];

  if (
    bad.some(
      (item) =>
        text.toLowerCase() ===
        item.toLowerCase()
    )
  ) {
    return "";
  }

  return text;
}


function firstValue(...values) {
  for (const value of values) {
    const cleaned =
      cleanValue(value);

    if (cleaned) return cleaned;
  }

  return "";
}


function normalizeTitle(title) {
  return cleanValue(title)
    .replace(
      /\s*[-|]\s*(사람인|잡코리아|인크루트).*$/i,
      ""
    )
    .trim();
}


function inferCompanyFromTitle(title) {
  const match =
    normalizeTitle(title).match(
      /^\[([^\]]{2,60})\]/
    );

  return match
    ? match[1].trim()
    : "";
}


function companyName(job) {
  return firstValue(
    job?.company,
    inferCompanyFromTitle(
      job?.title
    )
  );
}


/* =========================================================
   직무
========================================================= */

function normalizeSearchKeyword(keyword) {
  const value =
    String(keyword || "");

  if (/보건관리자/i.test(value)) {
    return "보건관리자";
  }

  if (/산업간호사/i.test(value)) {
    return "산업간호사";
  }

  if (/안전관리자/i.test(value)) {
    return "안전관리자";
  }

  if (/산업위생/i.test(value)) {
    return "산업위생";
  }

  return "";
}


function findRepresentativeJobLabel(text) {
  const value =
    String(text || "");

  const rules = [
    [/보건관리자/i, "보건관리자"],
    [/산업간호사/i, "산업간호사"],
    [/안전보건관리자/i, "안전보건관리자"],
    [/안전관리자/i, "안전관리자"],
    [/산업위생관리자/i, "산업위생관리자"],
    [/산업위생/i, "산업위생"],
    [/간호사/i, "간호사"],
  ];

  for (
    const [regex, label]
    of rules
  ) {
    if (regex.test(value)) {
      return label;
    }
  }

  return "";
}


function guessJobLabel(job) {
  const manual =
    cleanValue(
      job?.manualJobTitle
    );

  if (manual) return manual;

  const search =
    normalizeSearchKeyword(
      job?.searchKeyword
    );

  if (search) return search;

  const detail =
    findRepresentativeJobLabel(
      job?.jobTitle
    );

  if (detail) return detail;

  const title =
    findRepresentativeJobLabel(
      job?.title
    );

  if (title) return title;

  return "채용";
}


/* =========================================================
   고용형태
========================================================= */

function normalizeEmployment(value) {
  const original =
    cleanValue(value);

  if (!original) return "";

  const upper =
    original.toUpperCase();

  if (
    upper.includes("FULL_TIME") ||
    upper.includes("FULLTIME") ||
    upper.includes("PERMANENT")
  ) {
    return "정규직";
  }

  if (
    upper.includes("CONTRACTOR") ||
    upper.includes("CONTRACT") ||
    upper.includes("FIXED_TERM")
  ) {
    return "계약직";
  }

  if (
    upper.includes("PART_TIME")
  ) {
    return "시간제";
  }

  if (
    upper.includes("INTERN")
  ) {
    return "인턴";
  }

  return original;
}


function guessEmploymentType(job) {
  return normalizeEmployment(
    job?.employment
  );
}


/* =========================================================
   경력/학력/마감
========================================================= */

function normalizeExperience(value) {
  let text = cleanValue(value);

  if (!text) return "";

  return text
    .replace(
      /EXPERIENCE_NOT_REQUIRED/gi,
      "경력무관"
    )
    .replace(
      /NO_EXPERIENCE/gi,
      "경력무관"
    )
    .replace(
      /ENTRY_LEVEL/gi,
      "신입"
    )
    .replace(
      /EXPERIENCED/gi,
      "경력"
    )
    .replace(/\s*[,/]\s*/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeEducation(value) {
  const text = cleanValue(value);

  if (!text) return "";

  const upper =
    text.toUpperCase();

  if (
    upper.includes(
      "EDUCATION_NOT_REQUIRED"
    )
  ) {
    return "학력무관";
  }

  if (
    upper.includes("BACHELOR")
  ) {
    return "대졸";
  }

  return text;
}


function normalizeDeadline(value) {
  const text = cleanValue(value);

  if (!text) return "";

  if (/상시/i.test(text)) {
    return "상시채용";
  }

  if (/채용시/i.test(text)) {
    return "채용시";
  }

  let match = text.match(
    /\d{4}[-./](\d{1,2})[-./](\d{1,2})/
  );

  if (!match) {
    match = text.match(
      /(\d{1,2})[./](\d{1,2})/
    );
  }

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

  return text;
}


function shortLocation(location) {
  const value =
    cleanValue(location);

  if (!value) return "";

  const parts =
    value.split(/\s+/);

  return parts
    .slice(0, 2)
    .join(" ");
}


/* =========================================================
   검색
========================================================= */

async function runSearch() {
  const keyword =
    $("keyword")?.value.trim() ||
    "보건관리자";

  lastSearchKeyword = keyword;

  $("status").textContent =
    "사람인 · 잡코리아 · 인크루트에서 검색 중...";

  $("searchBtn").disabled = true;
  $("resultList").innerHTML = "";

  try {
    const response = await fetch(
      `/api/search?keyword=${encodeURIComponent(keyword)}`,
      {
        cache: "no-store",
      }
    );

    const data =
      await response.json();

    currentJobs =
      (data.jobs || []).map(
        (job) => ({
          ...job,

          searchKeyword:
            keyword,

          employment:
            normalizeEmployment(
              job.employment
            ),

          experience:
            normalizeExperience(
              job.experience
            ),

          education:
            normalizeEducation(
              job.education
            ),

          deadline:
            normalizeDeadline(
              job.deadline
            ),
        })
      );

    renderResults(currentJobs);

    const sourceCounts = {};

    currentJobs.forEach((job) => {
      sourceCounts[job.source] =
        (sourceCounts[job.source] || 0) +
        1;
    });

    const summary =
      Object.entries(sourceCounts)
        .map(
          ([source, count]) =>
            `${source} ${count}건`
        )
        .join(" · ");

    const failures =
      Object.keys(
        data.errors || {}
      );

    let status =
      `총 ${currentJobs.length}건`;

    if (summary) {
      status += ` (${summary})`;
    }

    if (failures.length) {
      status +=
        ` · 일부 검색 실패: ${failures.join(", ")}`;
    }

    $("status").textContent =
      status;
  } catch (error) {
    $("status").textContent =
      `검색 오류: ${error.message}`;
  } finally {
    $("searchBtn").disabled =
      false;
  }
}


function renderResults(jobs) {
  const list = $("resultList");

  list.innerHTML = "";

  jobs.forEach(
    (job, index) => {
      const item =
        document.createElement("li");

      item.className =
        "result-item";

      const company =
        companyName(job) ||
        "회사명 확인";

      const meta = [
        shortLocation(
          job.location
        ),
        guessEmploymentType(job),
        normalizeExperience(
          job.experience
        ),
        normalizeDeadline(
          job.deadline
        ),
      ]
        .filter(Boolean)
        .join(" · ");

      item.innerHTML = `
        <span class="src-tag">${escapeHtml(job.source)}</span>
        <p class="company">${escapeHtml(company)}</p>
        <p class="title">${escapeHtml(normalizeTitle(job.title))}</p>
        ${
          meta
            ? `<p class="result-meta">${escapeHtml(meta)}</p>`
            : ""
        }
      `;

      item.onclick =
        () => openSheet(index);

      list.appendChild(item);
    }
  );
}


/* =========================================================
   상세 조회
========================================================= */

async function fetchDetail(job) {
  const url =
    `/api/detail?source=${encodeURIComponent(job.source)}` +
    `&url=${encodeURIComponent(job.url)}`;

  const response =
    await fetch(url, {
      cache: "no-store",
    });

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      data.error ||
      "상세정보 실패"
    );
  }

  const detail =
    data.detail || {};

  return {
    ...job,

    searchKeyword:
      job.searchKeyword ||
      lastSearchKeyword,

    company:
      firstValue(
        detail.company,
        job.company
      ),

    title:
      firstValue(
        detail.title,
        job.title
      ),

    jobTitle:
      firstValue(
        detail.jobTitle,
        job.jobTitle
      ),

    location:
      firstValue(
        detail.location,
        job.location
      ),

    employment:
      normalizeEmployment(
        firstValue(
          detail.employment,
          job.employment
        )
      ),

    experience:
      normalizeExperience(
        firstValue(
          detail.experience,
          job.experience
        )
      ),

    education:
      normalizeEducation(
        firstValue(
          detail.education,
          job.education
        )
      ),

    deadline:
      normalizeDeadline(
        firstValue(
          detail.deadline,
          job.deadline
        )
      ),

    duties:
      firstValue(
        detail.duties,
        job.duties
      ),

    requirements:
      firstValue(
        detail.requirements,
        job.requirements
      ),

    preferences:
      firstValue(
        detail.preferences,
        job.preferences
      ),

    workConditions:
      firstValue(
        detail.workConditions,
        job.workConditions
      ),

    detailLoaded: true,
  };
}


async function ensureSelectedDetail() {
  if (
    !selectedJob ||
    selectedJob.detailLoaded
  ) {
    return selectedJob;
  }

  if (detailLoading) {
    return detailLoading;
  }

  detailLoading =
    fetchDetail(selectedJob)
      .then((job) => {
        selectedJob = job;

        const index =
          currentJobs.findIndex(
            (x) =>
              x.url === job.url
          );

        if (index >= 0) {
          currentJobs[index] = job;
        }

        updateSheet();

        return job;
      })
      .finally(() => {
        detailLoading = null;
      });

  return detailLoading;
}


/* =========================================================
   상세창
========================================================= */

async function openSheet(index) {
  selectedJob =
    currentJobs[index];

  updateSheet(true);

  $("sheetBackdrop")
    .classList.remove(
      "hidden"
    );

  try {
    await ensureSelectedDetail();
  } catch {
    updateSheet(false);

    showToast(
      "상세정보 일부를 가져오지 못했어요."
    );
  }
}


function updateSheet(loading = false) {
  if (!selectedJob) return;

  $("sheetTitle").textContent =
    normalizeTitle(
      selectedJob.title
    );

  if (loading) {
    $("sheetMeta").textContent =
      "상세 채용정보를 불러오는 중...";
  } else {
    $("sheetMeta").textContent =
      [
        companyName(
          selectedJob
        ),
        guessJobLabel(
          selectedJob
        ),
        shortLocation(
          selectedJob.location
        ),
        guessEmploymentType(
          selectedJob
        ),
        normalizeExperience(
          selectedJob.experience
        ),
      ]
        .filter(Boolean)
        .join(" · ");
  }

  fillDetailEditForm(
    selectedJob
  );
}


function closeSheet() {
  $("sheetBackdrop")
    ?.classList.add("hidden");
}


/* =========================================================
   수정 폼
========================================================= */

function setInput(id, value) {
  if ($(id)) {
    $(id).value =
      cleanValue(value);
  }
}


function fillDetailEditForm(job) {
  setInput(
    "d_company",
    companyName(job)
  );

  setInput(
    "d_jobTitle",
    guessJobLabel(job)
  );

  setInput(
    "d_location",
    job.location
  );

  setInput(
    "d_employment",
    guessEmploymentType(job)
  );

  setInput(
    "d_experience",
    normalizeExperience(
      job.experience
    )
  );

  setInput(
    "d_education",
    normalizeEducation(
      job.education
    )
  );

  setInput(
    "d_deadline",
    normalizeDeadline(
      job.deadline
    )
  );

  setInput(
    "d_duties",
    job.duties
  );

  setInput(
    "d_requirements",
    job.requirements
  );

  setInput(
    "d_preferences",
    job.preferences
  );

  setInput(
    "d_workConditions",
    job.workConditions
  );
}


function applyDetailEditForm() {
  if (!selectedJob) return;

  selectedJob = {
    ...selectedJob,

    company:
      $("d_company")?.value.trim(),

    manualJobTitle:
      $("d_jobTitle")?.value.trim(),

    location:
      $("d_location")?.value.trim(),

    employment:
      normalizeEmployment(
        $("d_employment")?.value
      ),

    experience:
      normalizeExperience(
        $("d_experience")?.value
      ),

    education:
      $("d_education")?.value.trim(),

    deadline:
      normalizeDeadline(
        $("d_deadline")?.value
      ),

    duties:
      $("d_duties")?.value.trim(),

    requirements:
      $("d_requirements")?.value.trim(),

    preferences:
      $("d_preferences")?.value.trim(),

    workConditions:
      $("d_workConditions")?.value.trim(),
  };

  updateSheet();

  showToast(
    "수정 내용을 반영했어요."
  );
}


/* =========================================================
   블로그 초안
========================================================= */

function section(value) {
  return cleanValue(value)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}


function buildDraft(job) {
  const company =
    companyName(job) ||
    "채용기업";

  const jobLabel =
    guessJobLabel(job);

  const deadline =
    normalizeDeadline(
      job.deadline
    );

  const lines = [
    `[제목]`,
    `${company} ${jobLabel} 채용`,
    ``,
    `[본문]`,
    `[여기에 대표 썸네일 이미지를 삽입하세요]`,
    ``,
    `안녕하세요. 고덕이네입니다.`,
    ``,
    `오늘 공유드릴 채용공고는 ${company} ${jobLabel} 채용입니다.`,
    ``,
    `| 채용 요약`,
    ``,
    `- 회사명: ${company}`,
    `- 모집 직무: ${jobLabel}`,
  ];

  if (job.location) {
    lines.push(
      `- 근무 지역: ${job.location}`
    );
  }

  if (
    guessEmploymentType(job)
  ) {
    lines.push(
      `- 고용 형태: ${guessEmploymentType(job)}`
    );
  }

  if (job.experience) {
    lines.push(
      `- 경력: ${normalizeExperience(job.experience)}`
    );
  }

  if (job.education) {
    lines.push(
      `- 학력: ${job.education}`
    );
  }

  if (deadline) {
    lines.push(
      `- 접수 마감: ${deadline}`
    );
  }

  const sections = [
    ["주요 업무", job.duties],
    ["지원자격", job.requirements],
    ["우대사항", job.preferences],
    ["근무조건", job.workConditions],
  ];

  sections.forEach(
    ([heading, value]) => {
      const items = section(value);

      if (!items.length) return;

      lines.push(
        "",
        `| ${heading}`,
        ""
      );

      items
        .slice(0, 8)
        .forEach((item) =>
          lines.push(
            `- ${item}`
          )
        );
    }
  );

  lines.push(
    "",
    "공고 원문",
    job.url || "",
    "",
    `#${jobLabel} #${jobLabel}채용 #채용정보 #고덕이네`
  );

  return lines.join("\n");
}


/* =========================================================
   Canvas
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
  paleBlue: "#e7efff",
};


function font(weight, size) {
  return (
    `${weight} ${size}px ` +
    `Pretendard, "Noto Sans KR", Arial, sans-serif`
  );
}


function roundRectPath(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    r
  );
}


function fitFontSize(
  ctx,
  text,
  weight,
  maxWidth,
  start,
  min
) {
  let size = start;

  while (size > min) {
    ctx.font =
      font(weight, size);

    if (
      ctx.measureText(text).width <=
      maxWidth
    ) {
      break;
    }

    size -= 2;
  }

  return size;
}


/* =========================================================
   아이콘
========================================================= */

function drawCircleIcon(
  ctx,
  cx,
  cy,
  symbol
) {
  ctx.fillStyle =
    COLORS.paleBlue;

  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    43,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.fillStyle =
    COLORS.vividBlue;

  ctx.font =
    font(700, 31);

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    symbol,
    cx,
    cy
  );

  ctx.textAlign =
    "left";
}


/* =========================================================
   ★ 토끼 PNG
========================================================= */

let mascotImg = null;
let mascotChecked = false;


function getMascotImage() {
  if (mascotChecked) {
    return Promise.resolve(
      mascotImg
    );
  }

  return new Promise(
    (resolve) => {
      const image =
        new Image();

      image.onload = () => {
        mascotImg = image;
        mascotChecked = true;
        resolve(image);
      };

      image.onerror = () => {
        mascotImg = null;
        mascotChecked = true;
        resolve(null);
      };

      image.src =
        "/icons/mascot-rabbit.png?v=7";
    }
  );
}


/* =========================================================
   썸네일 열기
========================================================= */

function openThumbSheet() {
  const job = selectedJob;

  if (!job) return;

  const label =
    guessJobLabel(job);

  $("f_company").value =
    companyName(job);

  $("f_jobLabel").value =
    label;

  $("f_sub1").value =
    shortLocation(
      job.location
    );

  $("f_sub2").value =
    `${label} 모집`;

  $("f_location").value =
    shortLocation(
      job.location
    );

  $("f_employment").value =
    guessEmploymentType(job);

  $("f_experience").value =
    normalizeExperience(
      job.experience
    );

  $("f_deadline").value =
    normalizeDeadline(
      job.deadline
    );

  $("f_useMascot").checked =
    true;

  closeSheet();

  $("thumbBackdrop")
    .classList.remove(
      "hidden"
    );

  drawThumbnail();
}


/* =========================================================
   ★ 썸네일
========================================================= */

async function drawThumbnail() {
  const canvas =
    $("thumbCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  const company =
    cleanValue(
      $("f_company").value
    ) ||
    "채용기업";

  const jobLabel =
    cleanValue(
      $("f_jobLabel").value
    ) ||
    "채용";

  const sub1 =
    cleanValue(
      $("f_sub1").value
    );

  const sub2 =
    cleanValue(
      $("f_sub2").value
    );

  const location =
    cleanValue(
      $("f_location").value
    );

  const employment =
    normalizeEmployment(
      $("f_employment").value
    );

  const experience =
    normalizeExperience(
      $("f_experience").value
    );

  const deadline =
    normalizeDeadline(
      $("f_deadline").value
    );

  ctx.clearRect(
    0,
    0,
    1080,
    1080
  );

  ctx.fillStyle =
    COLORS.white;

  ctx.fillRect(
    0,
    0,
    1080,
    1080
  );


  /* 외곽 */

  ctx.strokeStyle =
    COLORS.navy;

  ctx.lineWidth = 8;

  roundRectPath(
    ctx,
    18,
    18,
    1044,
    1044,
    45
  );

  ctx.stroke();


  const pad = 65;


  /* 상단 라벨 */

  const labelText =
    `${jobLabel} 채용`;

  const labelSize =
    fitFontSize(
      ctx,
      labelText,
      700,
      370,
      37,
      27
    );

  ctx.font =
    font(
      700,
      labelSize
    );

  const labelWidth =
    Math.min(
      410,
      ctx.measureText(
        labelText
      ).width + 64
    );

  ctx.fillStyle =
    COLORS.navy;

  roundRectPath(
    ctx,
    pad,
    75,
    labelWidth,
    76,
    38
  );

  ctx.fill();

  ctx.fillStyle =
    COLORS.white;

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    labelText,
    pad + 30,
    113
  );


  /* 회사명 - 거의 전체 폭 사용 */

  const companySize =
    fitFontSize(
      ctx,
      company,
      800,
      900,
      78,
      44
    );

  ctx.font =
    font(
      800,
      companySize
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    company,
    pad,
    275
  );


  /* 구분선 */

  ctx.strokeStyle =
    COLORS.lightLine;

  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(
    pad,
    330
  );
  ctx.lineTo(
    650,
    330
  );
  ctx.stroke();


  /* =====================================================
     왼쪽 텍스트 영역
     크게 유지: 약 600px
  ===================================================== */

  const textWidth = 600;

  if (sub1) {
    const locationSize =
      fitFontSize(
        ctx,
        sub1,
        700,
        textWidth,
        51,
        34
      );

    ctx.font =
      font(
        700,
        locationSize
      );

    ctx.fillStyle =
      COLORS.blue;

    ctx.fillText(
      sub1,
      pad,
      410
    );
  }


  if (sub2) {
    const roleSize =
      fitFontSize(
        ctx,
        sub2,
        700,
        textWidth,
        55,
        34
      );

    ctx.font =
      font(
        700,
        roleSize
      );

    ctx.fillStyle =
      COLORS.blue;

    ctx.fillText(
      sub2,
      pad,
      485
    );
  }


  /* =====================================================
     ★ 토끼 크게

     회사명 아래에서 시작하므로
     회사명 폭은 전혀 희생하지 않음.
  ===================================================== */

  if (
    $("f_useMascot")?.checked
  ) {
    const image =
      await getMascotImage();

    if (image) {
      /*
       * 기존 168 → 약 320.
       */
      const boxWidth = 330;
      const boxHeight = 350;

      const ratio =
        Math.min(
          boxWidth /
            image.width,
          boxHeight /
            image.height
        );

      const width =
        image.width * ratio;

      const height =
        image.height * ratio;

      const x =
        720 +
        (
          boxWidth -
          width
        ) /
        2;

      const y =
        305 +
        (
          boxHeight -
          height
        ) /
        2;

      ctx.drawImage(
        image,
        x,
        y,
        width,
        height
      );
    }
  }


  /* =====================================================
     하단 카드
  ===================================================== */

  const cards = [
    [
      "●",
      location,
      "근무지",
    ],

    [
      "▣",
      employment,
      "고용형태",
    ],

    [
      "♟",
      experience,
      "경력/자격",
    ],

    [
      "▦",
      deadline,
      "접수마감",
    ],
  ].filter(
    ([, value]) =>
      cleanValue(value)
  );


  const cardTop = 720;
  const cardHeight = 235;
  const gap = 14;

  if (cards.length) {
    const available =
      1080 - pad * 2;

    const cardWidth =
      (
        available -
        gap *
          (cards.length - 1)
      ) /
      cards.length;

    let x = pad;

    for (
      const [
        symbol,
        value,
        caption,
      ]
      of cards
    ) {
      ctx.fillStyle =
        COLORS.cardBg;

      ctx.strokeStyle =
        COLORS.lightLine;

      ctx.lineWidth = 2;

      roundRectPath(
        ctx,
        x,
        cardTop,
        cardWidth,
        cardHeight,
        20
      );

      ctx.fill();
      ctx.stroke();


      const cx =
        x + cardWidth / 2;

      drawCircleIcon(
        ctx,
        cx,
        cardTop + 63,
        symbol
      );


      const size =
        fitFontSize(
          ctx,
          value,
          700,
          cardWidth - 22,
          31,
          17
        );

      ctx.font =
        font(
          700,
          size
        );

      ctx.fillStyle =
        COLORS.navy;

      ctx.textAlign =
        "center";

      ctx.fillText(
        value,
        cx,
        cardTop + 155
      );


      ctx.font =
        font(
          400,
          21
        );

      ctx.fillStyle =
        COLORS.gray;

      ctx.fillText(
        caption,
        cx,
        cardTop + 198
      );

      ctx.textAlign =
        "left";

      x +=
        cardWidth + gap;
    }
  }


  /* 고덕이네 */

  ctx.font =
    font(700, 27);

  ctx.fillStyle =
    COLORS.navy;

  ctx.textAlign =
    "right";

  ctx.fillText(
    "고덕이네",
    1015,
    1015
  );

  ctx.textAlign =
    "left";
}


/* =========================================================
   이벤트
========================================================= */

$("searchBtn")
  ?.addEventListener(
    "click",
    runSearch
  );


$("keyword")
  ?.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        runSearch();
      }
    }
  );


$("sheetCloseBtn")
  ?.addEventListener(
    "click",
    closeSheet
  );


$("openOriginalBtn")
  ?.addEventListener(
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


$("saveDetailBtn")
  ?.addEventListener(
    "click",
    applyDetailEditForm
  );


$("draftBtn")
  ?.addEventListener(
    "click",
    async () => {
      try {
        await ensureSelectedDetail();
      } catch {}

      $("draftText").value =
        buildDraft(selectedJob);

      closeSheet();

      $("draftBackdrop")
        .classList.remove(
          "hidden"
        );
    }
  );


$("draftCloseBtn")
  ?.addEventListener(
    "click",
    () =>
      $("draftBackdrop")
        .classList.add(
          "hidden"
        )
  );


$("copyDraftBtn")
  ?.addEventListener(
    "click",
    async () => {
      await navigator.clipboard
        .writeText(
          $("draftText").value
        );

      showToast(
        "복사했어요."
      );
    }
  );


$("thumbBtn")
  ?.addEventListener(
    "click",
    async () => {
      try {
        await ensureSelectedDetail();
      } catch {}

      openThumbSheet();
    }
  );


$("thumbCloseBtn")
  ?.addEventListener(
    "click",
    () =>
      $("thumbBackdrop")
        .classList.add(
          "hidden"
        )
  );


$("regenThumbBtn")
  ?.addEventListener(
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
  $(id)?.addEventListener(
    "input",
    drawThumbnail
  );

  $(id)?.addEventListener(
    "change",
    drawThumbnail
  );
});


$("downloadThumbBtn")
  ?.addEventListener(
    "click",
    () => {
      $("thumbCanvas")
        .toBlob(
          (blob) => {
            if (!blob) return;

            const url =
              URL.createObjectURL(
                blob
              );

            const a =
              document.createElement(
                "a"
              );

            a.href = url;

            a.download =
              `썸네일_${companyName(selectedJob) || "채용"}.png`;

            a.click();

            URL.revokeObjectURL(
              url
            );
          },
          "image/png"
        );
    }
  );


/* =========================================================
   SW
========================================================= */

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }
  );
}
