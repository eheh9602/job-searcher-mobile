"use strict";

/* =========================================================
   상태
========================================================= */

let currentJobs = [];
let selectedJob = null;
let detailLoading = null;

const $ = (id) => document.getElementById(id);


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
   공통 텍스트 정리
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
  const text = String(value || "").trim();

  if (!text) return "";

  const invalidValues = [
    "원문 확인",
    "회사명 원문 확인",
    "지역 원문 확인",
    "경력 원문 확인",
    "마감 원문 확인",
    "고용형태 확인",
    "접수마감 확인",
    "확인 필요",
    "undefined",
    "null",
    "n/a",
  ];

  const lower = text.toLowerCase();

  if (
    invalidValues.some(
      (item) => lower === item.toLowerCase()
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


/* =========================================================
   회사명
========================================================= */

function inferCompanyFromTitle(title) {
  const text = cleanValue(title);

  if (!text) return "";

  const match = text.match(
    /^\[([^\]]{2,60})\]/
  );

  if (!match) return "";

  return match[1].trim();
}


function companyName(job) {
  return firstValue(
    job?.company,
    inferCompanyFromTitle(job?.title)
  );
}


/* =========================================================
   제목 정리
========================================================= */

function normalizeTitle(title) {
  let text = cleanValue(title);

  if (!text) return "";

  text = text
    .replace(
      /\s*[-|]\s*(사람인|잡코리아|인크루트).*$/i,
      ""
    )
    .replace(
      /\s*::\s*.*$/i,
      ""
    )
    .trim();

  return text;
}


/* =========================================================
   대표 직무명
========================================================= */

function guessJobLabel(job) {
  const stored = cleanValue(
    job?.jobTitle
  );

  if (stored) {
    /*
     * detail.js에서 직무명이 너무 길게 들어온 경우
     * 다시 대표 카테고리 추출
     */
    const inferred =
      findRepresentativeJobLabel(stored);

    if (inferred) return inferred;
  }

  const text = [
    job?.title,
    job?.jobTitle,
    job?.duties,
  ]
    .filter(Boolean)
    .join(" ");

  const inferred =
    findRepresentativeJobLabel(text);

  if (inferred) return inferred;

  /*
   * 못 찾았을 때는 제목의 앞부분을 사용하되
   * 너무 길지 않게.
   */
  let fallback =
    normalizeTitle(job?.title)
      .replace(/^\[[^\]]+\]\s*/, "")
      .replace(/\s*채용.*$/i, "")
      .replace(/\s*모집.*$/i, "")
      .trim();

  if (!fallback) {
    return "채용";
  }

  if (fallback.length > 14) {
    fallback =
      fallback.slice(0, 14);
  }

  return fallback;
}


function findRepresentativeJobLabel(text) {
  const value =
    String(text || "");

  const rules = [
    {
      regex: /보건관리자/i,
      label: "보건관리자",
    },
    {
      regex: /산업간호사/i,
      label: "산업간호사",
    },
    {
      regex: /안전보건관리자/i,
      label: "안전보건관리자",
    },
    {
      regex: /안전관리자/i,
      label: "안전관리자",
    },
    {
      regex: /산업위생관리자/i,
      label: "산업위생관리자",
    },
    {
      regex: /산업위생/i,
      label: "산업위생",
    },
    {
      regex: /간호사/i,
      label: "간호사",
    },
    {
      regex: /품질관리/i,
      label: "품질관리",
    },
    {
      regex: /현장관리/i,
      label: "현장관리",
    },
    {
      regex: /인테리어\s*설계/i,
      label: "인테리어 설계",
    },
    {
      regex: /환경관리/i,
      label: "환경관리",
    },
    {
      regex: /시설관리/i,
      label: "시설관리",
    },
  ];

  for (const rule of rules) {
    if (rule.regex.test(value)) {
      return rule.label;
    }
  }

  return "";
}


/* =========================================================
   고용형태 정리
========================================================= */

function normalizeEmployment(value) {
  const original =
    cleanValue(value);

  if (!original) return "";

  const upper =
    original.toUpperCase();

  const mappings = [
    [
      [
        "FULL_TIME",
        "FULLTIME",
        "PERMANENT",
        "REGULAR",
      ],
      "정규직",
    ],

    [
      [
        "CONTRACTOR",
        "CONTRACT",
        "CONTRACTED",
        "FIXED_TERM",
      ],
      "계약직",
    ],

    [
      [
        "PART_TIME",
        "PARTTIME",
      ],
      "시간제",
    ],

    [
      [
        "INTERN",
        "INTERNSHIP",
      ],
      "인턴",
    ],

    [
      [
        "TEMPORARY",
        "TEMP",
      ],
      "파견직",
    ],
  ];

  for (
    const [keys, korean]
    of mappings
  ) {
    if (
      keys.some(
        (key) =>
          upper.includes(key)
      )
    ) {
      return korean;
    }
  }

  const koreanTypes = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "촉탁직",
    "위촉직",
    "시간제",
    "아르바이트",
  ];

  for (const type of koreanTypes) {
    if (original.includes(type)) {
      return type;
    }
  }

  return original;
}


function guessEmploymentType(job) {
  const direct =
    normalizeEmployment(
      job?.employment
    );

  if (direct) return direct;

  const combined = [
    job?.title,
    job?.experience,
    job?.workConditions,
  ]
    .filter(Boolean)
    .join(" ");

  const types = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "촉탁직",
    "위촉직",
    "시간제",
    "아르바이트",
  ];

  for (const type of types) {
    if (combined.includes(type)) {
      return type;
    }
  }

  return "";
}


/* =========================================================
   경력값 정리
========================================================= */

function normalizeExperience(value) {
  let text =
    cleanValue(value);

  if (!text) return "";

  text = text
    .replace(
      /ENTRY_LEVEL/gi,
      "신입"
    )
    .replace(
      /EXPERIENCED/gi,
      "경력"
    )
    .replace(
      /NO_EXPERIENCE/gi,
      "경력무관"
    )
    .replace(
      /EXPERIENCE_NOT_REQUIRED/gi,
      "경력무관"
    )
    .replace(
      /NEWCOMER/gi,
      "신입"
    );

  text = text
    .replace(
      /\s*[,/]\s*/g,
      "·"
    )
    .replace(
      /신입\s*·\s*경력/g,
      "신입·경력"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

  return text;
}


/* =========================================================
   학력 정리
========================================================= */

function normalizeEducation(value) {
  let text =
    cleanValue(value);

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
    upper.includes(
      "BACHELOR"
    )
  ) {
    return "대졸";
  }

  if (
    upper.includes(
      "ASSOCIATE"
    )
  ) {
    return "전문대졸";
  }

  if (
    upper.includes(
      "HIGH_SCHOOL"
    )
  ) {
    return "고졸";
  }

  return text;
}


/* =========================================================
   지역 정리
========================================================= */

function shortLocation(location) {
  const value =
    cleanValue(location);

  if (!value) return "";

  const tokens =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (!tokens.length) return "";

  if (tokens.length >= 2) {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return tokens[0];
}


/* =========================================================
   마감일 정리
========================================================= */

function normalizeDeadline(value) {
  let text =
    cleanValue(value);

  if (!text) return "";

  if (/상시/i.test(text)) {
    return "상시채용";
  }

  if (/채용시/i.test(text)) {
    return "채용시";
  }

  /*
   * 2026-09-17
   */
  let match = text.match(
    /\d{4}[-./](\d{1,2})[-./](\d{1,2})/
  );

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

  /*
   * 09/17
   */
  match = text.match(
    /(\d{1,2})[./](\d{1,2})/
  );

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

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
      "사람인 · 잡코리아 · 인크루트에서 검색 중...";
  }

  if ($("searchBtn")) {
    $("searchBtn").disabled = true;
  }

  if ($("resultList")) {
    $("resultList").innerHTML = "";
  }

  try {
    const response =
      await fetch(
        `/api/search?keyword=${encodeURIComponent(
          keyword
        )}`,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    currentJobs =
      (data.jobs || []).map(
        (job) => ({
          ...job,

          company:
            cleanValue(
              job.company
            ),

          location:
            cleanValue(
              job.location
            ),

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

    const bySource = {};

    currentJobs.forEach(
      (job) => {
        bySource[job.source] =
          (bySource[job.source] || 0) +
          1;
      }
    );

    const summary =
      Object.entries(bySource)
        .map(
          ([source, count]) =>
            `${source} ${count}건`
        )
        .join(" · ");

    const failedSources =
      Object.keys(
        data.errors || {}
      );

    let text =
      currentJobs.length
        ? `총 ${currentJobs.length}건`
        : "검색 결과가 없습니다.";

    if (summary) {
      text += ` (${summary})`;
    }

    if (failedSources.length) {
      text +=
        ` · 일부 검색 실패: ${failedSources.join(
          ", "
        )}`;
    }

    if ($("status")) {
      $("status").textContent =
        text;
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


/* =========================================================
   검색결과
========================================================= */

function renderResults(jobs) {
  const list =
    $("resultList");

  if (!list) return;

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

        guessEmploymentType(
          job
        ),

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
        <span class="src-tag">
          ${escapeHtml(job.source)}
        </span>

        <p class="company">
          ${escapeHtml(company)}
        </p>

        <p class="title">
          ${escapeHtml(
            normalizeTitle(job.title)
          )}
        </p>

        ${
          meta
            ? `
              <p class="result-meta">
                ${escapeHtml(meta)}
              </p>
            `
            : ""
        }
      `;

      item.addEventListener(
        "click",
        () =>
          openSheet(index)
      );

      list.appendChild(item);
    }
  );
}


/* =========================================================
   상세정보 API
========================================================= */

async function fetchDetail(job) {
  if (!job?.url) {
    return job;
  }

  if (job.detailLoaded) {
    return job;
  }

  const endpoint =
    "/api/detail" +
    `?source=${encodeURIComponent(
      job.source || ""
    )}` +
    `&url=${encodeURIComponent(
      job.url
    )}`;

  const response =
    await fetch(endpoint, {
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
        `상세정보 HTTP ${response.status}`
    );
  }

  const detail =
    data.detail || {};

  return {
    ...job,

    company:
      firstValue(
        detail.company,
        job.company,
        inferCompanyFromTitle(
          job.title
        )
      ),

    title:
      firstValue(
        normalizeTitle(
          detail.title
        ),
        normalizeTitle(
          job.title
        )
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
  if (!selectedJob) {
    return null;
  }

  if (selectedJob.detailLoaded) {
    return selectedJob;
  }

  if (detailLoading) {
    return detailLoading;
  }

  detailLoading =
    (async () => {
      try {
        const enriched =
          await fetchDetail(
            selectedJob
          );

        selectedJob = enriched;

        const index =
          currentJobs.findIndex(
            (job) =>
              job.url ===
              enriched.url
          );

        if (index >= 0) {
          currentJobs[index] =
            enriched;
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
  selectedJob =
    currentJobs[index];

  updateSheet(true);

  $("sheetBackdrop")
    ?.classList.remove(
      "hidden"
    );

  try {
    await ensureSelectedDetail();
  } catch (error) {
    updateSheet(false);

    showToast(
      "상세정보 일부를 가져오지 못했어요."
    );
  }
}


function updateSheet(
  loading = false
) {
  if (!selectedJob) return;

  if ($("sheetTitle")) {
    $("sheetTitle").textContent =
      normalizeTitle(
        selectedJob.title
      ) ||
      "채용공고";
  }

  if ($("sheetMeta")) {
    if (loading) {
      $("sheetMeta").textContent =
        "상세 채용정보를 불러오는 중...";

      return;
    }

    const meta = [
      companyName(
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

      normalizeDeadline(
        selectedJob.deadline
      )
        ? `마감 ${normalizeDeadline(
            selectedJob.deadline
          )}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    $("sheetMeta").textContent =
      meta ||
      "상세정보는 원문에서 확인해주세요.";
  }

  fillDetailEditForm(
    selectedJob
  );
}


function closeSheet() {
  $("sheetBackdrop")
    ?.classList.add(
      "hidden"
    );
}


/* =========================================================
   상세정보 수정
========================================================= */

function setOptionalInput(
  id,
  value
) {
  const element = $(id);

  if (!element) return;

  element.value =
    cleanValue(value);
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
    guessEmploymentType(
      job
    )
  );

  setOptionalInput(
    "d_experience",
    normalizeExperience(
      job.experience
    )
  );

  setOptionalInput(
    "d_education",
    normalizeEducation(
      job.education
    )
  );

  setOptionalInput(
    "d_deadline",
    normalizeDeadline(
      job.deadline
    )
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

  const value = (
    id,
    fallback
  ) =>
    cleanValue(
      $(id)?.value
    ) ||
    fallback ||
    "";

  selectedJob = {
    ...selectedJob,

    company:
      value(
        "d_company",
        selectedJob.company
      ),

    jobTitle:
      value(
        "d_jobTitle",
        selectedJob.jobTitle
      ),

    location:
      value(
        "d_location",
        selectedJob.location
      ),

    employment:
      normalizeEmployment(
        value(
          "d_employment",
          selectedJob.employment
        )
      ),

    experience:
      normalizeExperience(
        value(
          "d_experience",
          selectedJob.experience
        )
      ),

    education:
      normalizeEducation(
        value(
          "d_education",
          selectedJob.education
        )
      ),

    deadline:
      normalizeDeadline(
        value(
          "d_deadline",
          selectedJob.deadline
        )
      ),

    duties:
      value(
        "d_duties",
        selectedJob.duties
      ),

    requirements:
      value(
        "d_requirements",
        selectedJob.requirements
      ),

    preferences:
      value(
        "d_preferences",
        selectedJob.preferences
      ),

    workConditions:
      value(
        "d_workConditions",
        selectedJob.workConditions
      ),
  };

  const index =
    currentJobs.findIndex(
      (job) =>
        job.url ===
        selectedJob.url
    );

  if (index >= 0) {
    currentJobs[index] =
      selectedJob;
  }

  updateSheet();

  showToast(
    "수정 내용을 반영했어요."
  );
}


/* =========================================================
   블로그 초안용 섹션
========================================================= */

function sectionLines(value) {
  const text =
    cleanValue(value);

  if (!text) return [];

  return text
    .split(/\n+/)
    .map(
      (line) =>
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
        arr.indexOf(item) ===
        index
    )
    .slice(0, 8);
}


function makeBulletSection(
  title,
  value
) {
  const lines =
    sectionLines(value);

  if (!lines.length) {
    return "";
  }

  return [
    `| ${title}`,
    "",
    ...lines.map(
      (line) =>
        `- ${line}`
    ),
    "",
  ].join("\n");
}


/* =========================================================
   블로그 제목
========================================================= */

function buildBlogTitle(job) {
  const company =
    companyName(job) ||
    "채용기업";

  const jobLabel =
    guessJobLabel(job);

  const extras = [
    shortLocation(
      job.location
    ),

    guessEmploymentType(
      job
    ),
  ].filter(Boolean);

  let title =
    `${company} ${jobLabel} 채용`;

  if (extras.length) {
    title +=
      ` | ${extras.join(
        " · "
      )}`;
  }

  return title;
}


/* =========================================================
   해시태그
========================================================= */

function buildHashtags(job) {
  const tags = [];

  function add(value) {
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
  }

  const label =
    guessJobLabel(job);

  const company =
    companyName(job);

  const location =
    shortLocation(
      job.location
    );

  add(label);
  add(`${label}채용`);
  add("채용정보");

  if (
    label.includes("보건") ||
    label.includes("간호")
  ) {
    add("산업보건");
    add("산업간호사");
  }

  if (
    label.includes("안전")
  ) {
    add("산업안전");
  }

  add(company);

  if (location) {
    add(`${location}채용`);
  }

  add(job.source);

  return tags
    .slice(0, 10)
    .map(
      (tag) =>
        `#${tag}`
    )
    .join(" ");
}


/* =========================================================
   블로그 초안
========================================================= */

function buildDraft(job) {
  const company =
    companyName(job) ||
    "채용기업";

  const jobLabel =
    guessJobLabel(job);

  const location =
    cleanValue(
      job.location
    );

  const employment =
    guessEmploymentType(
      job
    );

  const experience =
    normalizeExperience(
      job.experience
    );

  const education =
    normalizeEducation(
      job.education
    );

  const deadline =
    normalizeDeadline(
      job.deadline
    );

  const summaryItems = [
    [
      "회사명",
      company,
    ],

    [
      "모집 직무",
      jobLabel,
    ],

    [
      "공고명",
      normalizeTitle(
        job.title
      ),
    ],

    [
      "근무 지역",
      location,
    ],

    [
      "고용 형태",
      employment,
    ],

    [
      "경력",
      experience,
    ],

    [
      "학력",
      education,
    ],

    [
      "접수 마감",
      deadline,
    ],

    [
      "공고 출처",
      cleanValue(
        job.source
      ),
    ],
  ];

  const summary =
    summaryItems
      .filter(
        ([, value]) =>
          value
      )
      .map(
        ([label, value]) =>
          `- ${label}: ${value}`
      )
      .join("\n");

  const locationShort =
    shortLocation(
      location
    );

  const intro =
    locationShort
      ? `${locationShort} 지역에서 ${jobLabel} 채용을 찾고 계셨다면 확인해보셔도 좋을 것 같습니다.`
      : `${jobLabel} 채용을 찾고 계셨다면 확인해보셔도 좋을 것 같습니다.`;

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

  const fallback =
    sections
      ? ""
      : `| 지원 전 확인사항

- 세부 업무와 지원자격, 우대사항은 공고 원문에서 확인해주세요.

`;

  return `[제목]
${buildBlogTitle(job)}

[본문]
[여기에 대표 썸네일 이미지를 삽입하세요]

안녕하세요. 고덕이네입니다.

오늘 공유드릴 채용공고는
${company} ${jobLabel} 채용입니다.

${intro}

| 채용 요약

${summary}

${sections}${fallback}| 지원 전 체크

- 지원 전 실제 모집요강과 자격요건을 공고 원문에서 최종 확인해주세요.
${
  deadline
    ? `- 현재 확인된 접수 마감 정보는 ${deadline}입니다.`
    : "- 접수 마감일은 공고 원문에서 확인해주세요."
}

공고 원문
${job.url || ""}

${buildHashtags(job)}
`;
}


/* =========================================================
   Canvas 기본 설정
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

  ctx.moveTo(
    x + r,
    y
  );

  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    r
  );

  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    r
  );

  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    r
  );

  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    r
  );

  ctx.closePath();
}


function canvasFont(
  weight,
  size
) {
  return (
    `${weight} ${size}px ` +
    `Pretendard, "Noto Sans KR", ` +
    `Arial, sans-serif`
  );
}


function fitFontSize(
  ctx,
  text,
  weight,
  maxWidth,
  startSize,
  minSize
) {
  let size =
    startSize;

  ctx.font =
    canvasFont(
      weight,
      size
    );

  while (
    size > minSize &&
    ctx.measureText(
      text
    ).width >
      maxWidth
  ) {
    size -= 2;

    ctx.font =
      canvasFont(
        weight,
        size
      );
  }

  return size;
}


/* =========================================================
   카드 아이콘
========================================================= */

function drawIconLocation(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - 5,
    size * 0.52,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - 5,
    size * 0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    cx - size * 0.34,
    cy + size * 0.24
  );

  ctx.lineTo(
    cx,
    cy + size * 0.88
  );

  ctx.lineTo(
    cx + size * 0.34,
    cy + size * 0.24
  );

  ctx.stroke();
}


function drawIconDoc(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;

  const width =
    size * 1.05;

  const height =
    size * 1.35;

  ctx.strokeRect(
    cx - width / 2,
    cy - height / 2,
    width,
    height
  );

  for (
    let i = 0;
    i < 3;
    i++
  ) {
    const y =
      cy -
      height * 0.2 +
      i * size * 0.3;

    ctx.beginPath();

    ctx.moveTo(
      cx -
        width * 0.28,
      y
    );

    ctx.lineTo(
      cx +
        width * 0.28,
      y
    );

    ctx.stroke();
  }
}


function drawIconPerson(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.fillStyle = color;

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - size * 0.28,
    size * 0.25,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.arc(
    cx,
    cy + size * 0.38,
    size * 0.5,
    Math.PI,
    0
  );

  ctx.fill();
}


function drawIconCalendar(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;

  roundRectPath(
    ctx,
    cx - size,
    cy - size * 0.72,
    size * 2,
    size * 1.55,
    6
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(
    cx - size,
    cy - size * 0.25
  );

  ctx.lineTo(
    cx + size,
    cy - size * 0.25
  );

  ctx.stroke();

  [
    -0.45,
    0.45,
  ].forEach(
    (offset) => {
      ctx.beginPath();

      ctx.moveTo(
        cx +
          size *
            offset,
        cy - size
      );

      ctx.lineTo(
        cx +
          size *
            offset,
        cy -
          size *
            0.55
      );

      ctx.stroke();
    }
  );

  for (
    let row = 0;
    row < 2;
    row++
  ) {
    for (
      let col = 0;
      col < 3;
      col++
    ) {
      ctx.beginPath();

      ctx.arc(
        cx -
          size * 0.48 +
          col *
            size *
            0.48,

        cy +
          size * 0.08 +
          row *
            size *
            0.35,

        size * 0.07,

        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }
}


const ICONS = {
  location:
    drawIconLocation,

  doc:
    drawIconDoc,

  person:
    drawIconPerson,

  calendar:
    drawIconCalendar,
};


/* =========================================================
   토끼 이미지
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

      image.onload =
        () => {
          mascotImg =
            image;

          mascotChecked =
            true;

          resolve(image);
        };

      image.onerror =
        () => {
          mascotImg = null;

          mascotChecked =
            true;

          resolve(null);
        };

      /*
       * 집에서 올릴 토끼 얼굴 PNG
       */
      image.src =
        "/icons/mascot-rabbit.png?v=3";
    }
  );
}


/* =========================================================
   PNG 없을 때 임시 토끼
========================================================= */

function drawFallbackRabbit(
  ctx,
  cx,
  cy,
  scale
) {
  ctx.save();

  ctx.strokeStyle =
    COLORS.navy;

  ctx.fillStyle =
    COLORS.white;

  ctx.lineWidth = 5;

  ctx.lineCap =
    "round";

  /*
   * 귀
   */
  ctx.beginPath();

  ctx.ellipse(
    cx - scale * 0.2,
    cy - scale * 0.56,
    scale * 0.11,
    scale * 0.3,
    -0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();
  ctx.stroke();

  ctx.beginPath();

  ctx.ellipse(
    cx + scale * 0.2,
    cy - scale * 0.56,
    scale * 0.11,
    scale * 0.3,
    0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();
  ctx.stroke();

  /*
   * 얼굴
   */
  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    scale * 0.42,
    0,
    Math.PI * 2
  );

  ctx.fill();
  ctx.stroke();

  /*
   * 눈
   */
  ctx.fillStyle =
    COLORS.navy;

  [
    cx - scale * 0.14,
    cx + scale * 0.14,
  ].forEach(
    (x) => {
      ctx.beginPath();

      ctx.arc(
        x,
        cy - scale * 0.03,
        scale * 0.027,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  );

  /*
   * 코
   */
  ctx.beginPath();

  ctx.arc(
    cx,
    cy + scale * 0.07,
    scale * 0.02,
    0,
    Math.PI * 2
  );

  ctx.fill();

  /*
   * 입
   */
  ctx.strokeStyle =
    COLORS.navy;

  ctx.lineWidth = 3;

  ctx.beginPath();

  ctx.moveTo(
    cx,
    cy + scale * 0.09
  );

  ctx.lineTo(
    cx,
    cy + scale * 0.16
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(
    cx,
    cy + scale * 0.16
  );

  ctx.quadraticCurveTo(
    cx - scale * 0.07,
    cy + scale * 0.22,
    cx - scale * 0.12,
    cy + scale * 0.17
  );

  ctx.moveTo(
    cx,
    cy + scale * 0.16
  );

  ctx.quadraticCurveTo(
    cx + scale * 0.07,
    cy + scale * 0.22,
    cx + scale * 0.12,
    cy + scale * 0.17
  );

  ctx.stroke();

  ctx.restore();
}


/* =========================================================
   썸네일용 직무 부제
========================================================= */

function buildThumbnailSubtitle(job) {
  let title =
    normalizeTitle(
      job?.title
    );

  const company =
    companyName(job);

  if (company) {
    title = title
      .replace(
        new RegExp(
          `^\\[?${escapeRegExp(
            company
          )}\\]?\\s*`,
          "i"
        ),
        ""
      )
      .trim();
  }

  /*
   * 너무 긴 실제 공고명은
   * 썸네일용으로 줄인다.
   */
  if (title.length > 22) {
    title =
      title.slice(0, 22) +
      "…";
  }

  return title;
}


function escapeRegExp(value) {
  return String(value || "")
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}


/* =========================================================
   썸네일 열기
========================================================= */

function openThumbSheet() {
  if (!selectedJob) return;

  const job =
    selectedJob;

  const company =
    companyName(job) ||
    "채용기업";

  const label =
    guessJobLabel(job);

  const subtitle =
    buildThumbnailSubtitle(
      job
    );

  if ($("f_company")) {
    $("f_company").value =
      company;
  }

  if ($("f_jobLabel")) {
    $("f_jobLabel").value =
      label;
  }

  /*
   * 회사명이 위에서 이미 크게 나오므로
   * 부제1에는 회사명을 다시 넣지 않음.
   */
  if ($("f_sub1")) {
    $("f_sub1").value =
      subtitle ||
      `${label} 채용`;
  }

  if ($("f_sub2")) {
    $("f_sub2").value =
      "";
  }

  if ($("f_location")) {
    $("f_location").value =
      shortLocation(
        job.location
      );
  }

  if ($("f_employment")) {
    $("f_employment").value =
      guessEmploymentType(
        job
      );
  }

  if ($("f_experience")) {
    $("f_experience").value =
      normalizeExperience(
        job.experience
      );
  }

  if ($("f_deadline")) {
    $("f_deadline").value =
      normalizeDeadline(
        job.deadline
      );
  }

  if ($("f_useMascot")) {
    $("f_useMascot").checked =
      true;
  }

  closeSheet();

  $("thumbBackdrop")
    ?.classList.remove(
      "hidden"
    );

  drawThumbnail();
}


/* =========================================================
   썸네일 그리기
========================================================= */

async function drawThumbnail() {
  const canvas =
    $("thumbCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  const company =
    cleanValue(
      $("f_company")?.value
    ) ||
    "채용기업";

  const jobLabel =
    cleanValue(
      $("f_jobLabel")?.value
    ) ||
    "채용";

  const sub1 =
    cleanValue(
      $("f_sub1")?.value
    );

  const sub2 =
    cleanValue(
      $("f_sub2")?.value
    );

  const location =
    cleanValue(
      $("f_location")?.value
    );

  const employment =
    normalizeEmployment(
      $("f_employment")?.value
    );

  const experience =
    normalizeExperience(
      $("f_experience")?.value
    );

  const deadline =
    normalizeDeadline(
      $("f_deadline")?.value
    );

  const useMascot =
    $("f_useMascot")
      ? $("f_useMascot").checked
      : true;


  /* -----------------------------------------------------
     배경
  ----------------------------------------------------- */

  ctx.clearRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );

  ctx.fillStyle =
    COLORS.white;

  ctx.fillRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );


  /* -----------------------------------------------------
     외곽 테두리
  ----------------------------------------------------- */

  ctx.strokeStyle =
    COLORS.vividBlue;

  ctx.lineWidth = 8;

  roundRectPath(
    ctx,
    24,
    24,
    CANVAS_SIZE - 48,
    CANVAS_SIZE - 48,
    46
  );

  ctx.stroke();


  const pad = 70;


  /* -----------------------------------------------------
     상단 직무 라벨
  ----------------------------------------------------- */

  const labelText =
    jobLabel.endsWith("채용")
      ? jobLabel
      : `${jobLabel} 채용`;

  const labelFontSize =
    fitFontSize(
      ctx,
      labelText,
      700,
      440,
      42,
      28
    );

  ctx.font =
    canvasFont(
      700,
      labelFontSize
    );

  const labelWidth =
    Math.min(
      480,
      ctx.measureText(
        labelText
      ).width +
        68
    );

  const labelHeight = 84;

  ctx.fillStyle =
    COLORS.vividBlue;

  roundRectPath(
    ctx,
    pad,
    82,
    labelWidth,
    labelHeight,
    42
  );

  ctx.fill();

  ctx.fillStyle =
    COLORS.white;

  ctx.font =
    canvasFont(
      700,
      labelFontSize
    );

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    labelText,
    pad + 34,
    82 +
      labelHeight / 2
  );


  /* -----------------------------------------------------
     토끼 우측 상단
  ----------------------------------------------------- */

  if (useMascot) {
    const image =
      await getMascotImage();

    if (image) {
      /*
       * 얼굴 PNG 기준.
       * 너무 크게 안 나오게.
       */
      const maxSize = 150;

      const ratio =
        Math.min(
          maxSize /
            image.width,
          maxSize /
            image.height
        );

      const width =
        image.width * ratio;

      const height =
        image.height * ratio;

      ctx.drawImage(
        image,
        CANVAS_SIZE -
          pad -
          width,
        62,
        width,
        height
      );
    } else {
      drawFallbackRabbit(
        ctx,
        CANVAS_SIZE -
          145,
        132,
        108
      );
    }
  }


  /* -----------------------------------------------------
     회사명
  ----------------------------------------------------- */

  const companyMaxWidth =
    CANVAS_SIZE -
    pad * 2;

  const companySize =
    fitFontSize(
      ctx,
      company,
      800,
      companyMaxWidth,
      96,
      50
    );

  ctx.font =
    canvasFont(
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
    292
  );


  /* -----------------------------------------------------
     구분선
  ----------------------------------------------------- */

  const dividerY = 346;

  ctx.strokeStyle =
    COLORS.lightLine;

  ctx.lineWidth = 3;

  ctx.beginPath();

  ctx.moveTo(
    pad,
    dividerY
  );

  ctx.lineTo(
    CANVAS_SIZE -
      pad,
    dividerY
  );

  ctx.stroke();


  /* -----------------------------------------------------
     실제 직무/공고명
  ----------------------------------------------------- */

  const subtitles =
    [
      sub1,
      sub2,
    ]
      .filter(Boolean)
      .filter(
        (value, index, arr) =>
          arr.indexOf(value) ===
          index
      );

  let subtitleY = 430;

  ctx.fillStyle =
    COLORS.blue;

  subtitles
    .slice(0, 2)
    .forEach(
      (text) => {
        const size =
          fitFontSize(
            ctx,
            text,
            700,
            CANVAS_SIZE -
              pad * 2,
            52,
            31
          );

        ctx.font =
          canvasFont(
            700,
            size
          );

        ctx.fillText(
          text,
          pad,
          subtitleY
        );

        subtitleY +=
          size + 28;
      }
    );


  /* -----------------------------------------------------
     카드

     카드 4개 구조 유지.
     다만 빈 값은 숨김.
  ----------------------------------------------------- */

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


  /*
   * 4개면 네가 원한 원래 구성.
   * 값이 부족한 경우만 3/2/1개로 자동 재배치.
   */

  const cardTop = 700;
  const cardHeight = 240;
  const gap = 16;

  if (cards.length) {
    const availableWidth =
      CANVAS_SIZE -
      pad * 2;

    let cardWidth;

    if (cards.length === 1) {
      cardWidth = 330;
    } else {
      cardWidth =
        (
          availableWidth -
          gap *
            (cards.length - 1)
        ) /
        cards.length;
    }

    let currentX =
      cards.length === 1
        ? (
            CANVAS_SIZE -
            cardWidth
          ) /
          2
        : pad;


    for (const card of cards) {
      /*
       * 카드 배경
       */
      ctx.fillStyle =
        COLORS.cardBg;

      ctx.strokeStyle =
        COLORS.lightLine;

      ctx.lineWidth = 2;

      roundRectPath(
        ctx,
        currentX,
        cardTop,
        cardWidth,
        cardHeight,
        22
      );

      ctx.fill();
      ctx.stroke();


      const centerX =
        currentX +
        cardWidth / 2;

      const iconY =
        cardTop + 65;


      /*
       * 아이콘 원
       */
      ctx.fillStyle =
        COLORS.paleBlue;

      ctx.beginPath();

      ctx.arc(
        centerX,
        iconY,
        45,
        0,
        Math.PI * 2
      );

      ctx.fill();


      ICONS[card.icon](
        ctx,
        centerX,
        iconY,
        25,
        COLORS.vividBlue
      );


      /*
       * 값
       */
      const valueFontSize =
        fitFontSize(
          ctx,
          card.value,
          700,
          cardWidth - 22,
          34,
          18
        );

      ctx.font =
        canvasFont(
          700,
          valueFontSize
        );

      ctx.fillStyle =
        COLORS.navy;

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "alphabetic";

      ctx.fillText(
        card.value,
        centerX,
        cardTop + 157
      );


      /*
       * 설명
       */
      ctx.font =
        canvasFont(
          400,
          23
        );

      ctx.fillStyle =
        COLORS.gray;

      ctx.fillText(
        card.caption,
        centerX,
        cardTop + 201
      );

      ctx.textAlign =
        "left";


      currentX +=
        cardWidth + gap;
    }
  }


  /* -----------------------------------------------------
     고덕이네
  ----------------------------------------------------- */

  ctx.font =
    canvasFont(
      700,
      30
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textAlign =
    "right";

  ctx.fillText(
    "고덕이네",
    CANVAS_SIZE -
      pad,
    1010
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
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        runSearch();
      }
    }
  );


$("sheetCloseBtn")
  ?.addEventListener(
    "click",
    closeSheet
  );


$("sheetBackdrop")
  ?.addEventListener(
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


$("openOriginalBtn")
  ?.addEventListener(
    "click",
    () => {
      if (
        selectedJob?.url
      ) {
        window.open(
          selectedJob.url,
          "_blank"
        );
      }
    }
  );


/* =========================================================
   상세 다시 불러오기
========================================================= */

$("reloadDetailBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) {
        return;
      }

      selectedJob.detailLoaded =
        false;

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


$("saveDetailBtn")
  ?.addEventListener(
    "click",
    applyDetailEditForm
  );


/* =========================================================
   블로그 초안
========================================================= */

$("draftBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) {
        return;
      }

      try {
        await ensureSelectedDetail();
      } catch {
        /*
         * 상세 실패해도
         * 현재 데이터로 생성
         */
      }

      if ($("draftText")) {
        $("draftText").value =
          buildDraft(
            selectedJob
          );
      }

      closeSheet();

      $("draftBackdrop")
        ?.classList.remove(
          "hidden"
        );
    }
  );


$("draftCloseBtn")
  ?.addEventListener(
    "click",
    () => {
      $("draftBackdrop")
        ?.classList.add(
          "hidden"
        );
    }
  );


$("draftBackdrop")
  ?.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        $("draftBackdrop")
      ) {
        $("draftBackdrop")
          ?.classList.add(
            "hidden"
          );
      }
    }
  );


$("copyDraftBtn")
  ?.addEventListener(
    "click",
    async () => {
      const text =
        $("draftText")?.value ||
        "";

      try {
        await navigator.clipboard
          .writeText(text);

        showToast(
          "클립보드에 복사했어요."
        );
      } catch {
        if ($("draftText")) {
          $("draftText")
            .select();

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


/* =========================================================
   썸네일
========================================================= */

$("thumbBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) {
        return;
      }

      try {
        await ensureSelectedDetail();
      } catch {
        /*
         * 현재 데이터로 진행
         */
      }

      openThumbSheet();
    }
  );


$("thumbCloseBtn")
  ?.addEventListener(
    "click",
    () => {
      $("thumbBackdrop")
        ?.classList.add(
          "hidden"
        );
    }
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
].forEach(
  (id) => {
    const element = $(id);

    if (!element) return;

    element.addEventListener(
      "input",
      drawThumbnail
    );

    element.addEventListener(
      "change",
      drawThumbnail
    );
  }
);


/* =========================================================
   썸네일 PNG 저장
========================================================= */

$("downloadThumbBtn")
  ?.addEventListener(
    "click",
    () => {
      const canvas =
        $("thumbCanvas");

      if (!canvas) return;

      canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          const fileName =
            (
              $("f_company")
                ?.value ||
              "thumbnail"
            )
              .replace(
                /[^\w가-힣()]/g,
                "_"
              );

          link.href = url;

          link.download =
            `썸네일_${fileName}.png`;

          document.body
            .appendChild(
              link
            );

          link.click();
          link.remove();

          URL.revokeObjectURL(
            url
          );

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

if (
  "serviceWorker" in
  navigator
) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register(
          "/sw.js"
        )
        .catch(() => {});
    }
  );
}
